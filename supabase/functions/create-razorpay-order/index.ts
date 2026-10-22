// @ts-ignore - Deno/TS does not provide bundled types for this remote ESM module.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve(handler: (req: Request) => Promise<Response> | Response): void;
  env: {
    get(key: string): string | undefined;
  };
};

/* ------------------------------------------------------------------ */
/* CORS                                                                */
/* ------------------------------------------------------------------ */
// Local dev origins are always allowed. Add your production site(s) with the
// ALLOWED_ORIGINS secret, e.g. "https://www.example.com,https://example.com".

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'https://as-fitness-gym.netlify.app',
];


function corsFor(req: Request): Record<string, string> {
  const extra = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ORIGINS, ...extra]);
  const origin = req.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT_INR = 10000000; // sanity ceiling (same as the original function)

// Same formula the checkout page uses to display the price (whole rupees).
function payableInr(plan: {
  price_inr: unknown;
  discount_percent: unknown;
  joining_fee_inr: unknown;
}): number {
  const discounted = Math.round(
    Number(plan.price_inr) * (1 - Number(plan.discount_percent || 0) / 100),
  );
  return discounted + Number(plan.joining_fee_inr || 0);
}

function host(u: string | undefined): string {
  try {
    return new URL(u || '').host;
  } catch {
    return 'invalid-url';
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    /* ---------------- 1. Parse + validate request ---------------- */
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body', code: 'bad_json' }, 400);
    }

    const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : '';
    const fullName =
      typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const startDate =
      typeof body.preferred_start_date === 'string'
        ? body.preferred_start_date.trim()
        : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (body.consent !== true) {
      return json({ error: 'Please accept the privacy notice', code: 'no_consent' }, 400);
    }
    if (fullName.length < 2 || fullName.length > 120) {
      return json({ error: 'Enter your full name (2–120 characters)', code: 'bad_name' }, 400);
    }
    if (phone.length < 8 || phone.length > 20) {
      return json({ error: 'Enter a valid phone number (8–20 characters)', code: 'bad_phone' }, 400);
    }
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) {
      return json({ error: 'Enter a valid email address', code: 'bad_email' }, 400);
    }
    if (startDate && !DATE_RE.test(startDate)) {
      return json({ error: 'Invalid preferred start date', code: 'bad_date' }, 400);
    }
    if (message.length > 2000) {
      return json({ error: 'Message is too long', code: 'bad_message' }, 400);
    }
    if (!UUID_RE.test(planId)) {
      // The checkout page must send membership_plans.id (a UUID), not a name.
      console.warn('create-order: plan_id is not a UUID');
      return json({ error: 'Invalid membership plan selected', code: 'invalid_plan_id' }, 400);
    }

    /* ---------------- 2. Environment ---------------- */
    const url = Deno.env.get('SUPABASE_URL');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (!url || !service || !keyId || !secret) {
      console.error('create-order: missing server environment configuration');
      return json({ error: 'Payment service is not configured', code: 'not_configured' }, 503);
    }

    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bearer = req.headers.get('Authorization') || '';
    const accessToken = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
    if (!accessToken) return json({ error: 'Please sign in with Google before buying a membership.', code: 'login_required' }, 401);
    const { data: authData, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !authData.user) return json({ error: 'Your login session expired. Please sign in again.', code: 'invalid_session' }, 401);
    const authUserId = authData.user.id;

    /* ---------------- 3. Load the plan (trusted source of price) -------- */
    // maybeSingle(): "no row" is data=null (not an error), so a genuine DB /
    // credential problem can be told apart from "plan does not exist".
    const { data: plan, error: planErr } = await db
      .from('membership_plans')
      .select(
        'id,name,price_inr,discount_percent,joining_fee_inr,duration_days,is_active',
      )
      .eq('id', planId)
      .maybeSingle();

    if (planErr) {
      // Never reported as "plan not available": this is a server/config fault.
      console.error('create-order: plan lookup DB error', {
        code: planErr.code,
        message: planErr.message,
        hint: planErr.hint,
        supabase_host: host(url),
      });
      // A short, non-sensitive tag so the problem can be identified from the browser too.
      const msg = String(planErr.message || '').toLowerCase();
      const tag = msg.includes('permission denied')
        ? 'permission_denied'
        : msg.includes('invalid api key') || msg.includes('jwt')
          ? 'invalid_service_key'
          : msg.includes('fetch') || msg.includes('network')
            ? 'network'
            : 'db_error';
      return json(
        {
          error: 'Could not load the membership plan. Please try again later.',
          code: 'plan_lookup_failed',
          ref: `plan_lookup_failed/${tag}/${planErr.code || 'no_code'}`,
        },
        500,
      );
    }
    if (!plan) {
      console.warn('create-order: no plan with that id', {
        plan_id: planId,
        supabase_host: host(url),
      });
      return json({ error: 'This membership plan is not available', code: 'plan_not_found' }, 404);
    }
    if (plan.is_active !== true) {
      return json({ error: 'This membership plan is not available', code: 'plan_inactive' }, 404);
    }

    /* ---------------- 4. Amount (server-side only) ---------------- */
    const amountInr = payableInr(plan);
    if (
      !Number.isSafeInteger(amountInr) ||
      amountInr < 1 ||
      amountInr > MAX_AMOUNT_INR
    ) {
      console.error('create-order: invalid computed amount', { plan_id: plan.id, amountInr });
      return json({ error: 'Invalid plan amount', code: 'bad_amount' }, 400);
    }
    const amountPaise = amountInr * 100; // Razorpay wants integer paise

    /* ---------------- 5. Create the Razorpay order ---------------- */
    // Done before touching our tables so a Razorpay failure leaves no rows.
    const enquiryId = crypto.randomUUID();

    let order: { id: string; amount: number; currency: string };
    try {
      const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${keyId}:${secret}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: `asfg_${enquiryId.replaceAll('-', '').slice(0, 20)}`,
          notes: { enquiry_id: enquiryId, plan_id: plan.id, plan_name: plan.name },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !payload?.id) {
        console.error('create-order: Razorpay order creation failed', {
          http_status: orderRes.status,
          code: payload?.error?.code,
          description: payload?.error?.description,
        });
        return json({ error: 'Payment provider could not create an order', code: 'provider_error' }, 502);
      }
      order = payload;
    } catch (e) {
      console.error('create-order: Razorpay request error', e instanceof Error ? e.name : 'unknown');
      return json({ error: 'Payment provider is unreachable. Please try again.', code: 'provider_unreachable' }, 502);
    }

    /* ---------------- 6. Save enquiry + payment ---------------- */
    const { error: enquiryErr } = await db.from('enquiries').insert({
      id: enquiryId,
      full_name: fullName,
      phone,
      email: email || null,
      interested_plan: plan.name,
      preferred_start_date: startDate || null,
      message: message || null,
      source: 'online_checkout',
      consent: true,
    });
    if (enquiryErr) {
      // Nothing to clean up: the unpaid Razorpay order simply expires.
      console.error('create-order: enquiry insert failed', {
        code: enquiryErr.code,
        message: enquiryErr.message,
      });
      return json({ error: 'Could not save your details. Please try again.', code: 'enquiry_failed' }, 500);
    }

    const { error: payErr } = await db.from('payments').insert({
      plan_id: plan.id,
      plan_name_snapshot: plan.name,
      amount_inr: amountInr,
      currency: 'INR',
      status: 'created',
      provider: 'razorpay',
      razorpay_order_id: order.id,
      metadata: {
        enquiry_id: enquiryId,
        plan_snapshot: {
          id: plan.id,
          name: plan.name,
          duration_days: plan.duration_days,
          price_inr: amountInr - Number(plan.joining_fee_inr || 0),
          joining_fee_inr: Number(plan.joining_fee_inr || 0),
        },
        customer: {
          full_name: fullName,
          phone,
          email: email || null,
          preferred_start_date: startDate || null,
          auth_user_id: authUserId,
        },
      },
    });
    if (payErr) {
      console.error('create-order: payment insert failed', {
        code: payErr.code,
        message: payErr.message,
      });
      // Don't leave an orphaned enquiry behind (best effort).
      const { error: cleanupErr } = await db.from('enquiries').delete().eq('id', enquiryId);
      if (cleanupErr) {
        console.error('create-order: orphan enquiry cleanup failed', { enquiry_id: enquiryId });
      }
      return json({ error: 'Could not record the payment order. Please try again.', code: 'payment_record_failed' }, 500);
    }

    console.log('create-order: ok', { order_id: order.id, plan_id: plan.id, amount_inr: amountInr });

    return json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId, // public key id only; the secret never leaves the server
      plan_name: plan.name,
    });
  } catch (e) {
    console.error('create-order: unexpected error', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'Unable to start checkout', code: 'unexpected' }, 500);
  }
});

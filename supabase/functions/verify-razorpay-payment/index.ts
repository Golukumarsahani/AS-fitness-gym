// @ts-ignore - Deno/TS does not provide bundled types for this remote ESM module.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve(handler: (req: Request) => Promise<Response> | Response): void;
  env: {
    get(key: string): string | undefined;
  };
};

/* ------------------------------------------------------------------ */
/* CORS (same allow-list rules as create-razorpay-order)               */
/* ------------------------------------------------------------------ */
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
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
  if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/* ------------------------------------------------------------------ */
/* Crypto helpers                                                      */
/* ------------------------------------------------------------------ */
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Membership activation (idempotent; also used by razorpay-webhook)   */
/* ------------------------------------------------------------------ */
// deno-lint-ignore no-explicit-any
async function activateMembership(db: any, payment: any): Promise<void> {
  // Already activated for this payment? Nothing to do.
  const existing = await db
    .from('memberships')
    .select('id,member_id')
    .eq('payment_id', payment.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (!payment.membership_id) {
      await db
        .from('payments')
        .update({ member_id: existing.data.member_id, membership_id: existing.data.id })
        .eq('id', payment.id);
    }
    return;
  }

  const metadata = payment.metadata || {};
  const snapshot = metadata.plan_snapshot || {};
  const customer = metadata.customer || {};
  const phone = String(customer.phone || '').trim();
  if (phone.length < 8) throw new Error('Payment metadata has no valid customer phone');

  // Find or create the member (phone is unique among non-archived members).
  const findMember = async () => {
    const r = await db
      .from('members')
      .select('id')
      .eq('phone', phone)
      .neq('status', 'archived')
      .maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  };
  let member = await findMember();
  if (!member) {
    const created = await db
      .from('members')
      .insert({
        full_name: String(customer.full_name || 'Online member'),
        phone,
        email: customer.email || null,
        status: 'active',
      })
      .select('id')
      .single();
    if (created.error) {
      if (created.error.code !== '23505') throw created.error; // lost a race
      member = await findMember();
      if (!member) throw created.error;
    } else {
      member = created.data;
    }
  }

  const start =
    typeof customer.preferred_start_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(customer.preferred_start_date)
      ? new Date(`${customer.preferred_start_date}T00:00:00Z`)
      : new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(1, Number(snapshot.duration_days || 30)));

  const inserted = await db
    .from('memberships')
    .insert({
      member_id: member.id,
      plan_id: snapshot.id || payment.plan_id,
      plan_name_snapshot: String(snapshot.name || payment.plan_name_snapshot),
      price_inr: Number(snapshot.price_inr ?? payment.amount_inr),
      joining_fee_inr: Number(snapshot.joining_fee_inr || 0),
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      status: 'active',
      source: 'online_payment',
      payment_id: payment.id,
    })
    .select('id')
    .single();

  let membershipId: string | null = inserted.data?.id ?? null;
  if (inserted.error) {
    if (inserted.error.code !== '23505') throw inserted.error; // duplicate = already done
    const again = await db.from('memberships').select('id').eq('payment_id', payment.id).maybeSingle();
    membershipId = again.data?.id ?? null;
  }

  const link = await db
    .from('payments')
    .update({ member_id: member.id, membership_id: membershipId })
    .eq('id', payment.id);
  if (link.error) throw link.error;
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */
Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid request body' }, 400);
    }
    const orderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const paymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    if (!/^order_\w+$/.test(orderId) || !/^pay_\w+$/.test(paymentId) || !signature) {
      return json({ error: 'Missing or malformed payment verification fields' }, 400);
    }

    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const url = Deno.env.get('SUPABASE_URL');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !keyId || !url || !service) {
      console.error('verify-payment: missing server environment configuration');
      return json({ error: 'Payment service is not configured' }, 503);
    }

    // 1. Signature: HMAC_SHA256(order_id|payment_id, key_secret)
    const expected = await hmacHex(secret, `${orderId}|${paymentId}`);
    if (!timingSafeEqual(expected, signature)) {
      console.warn('verify-payment: signature mismatch', { order_id: orderId });
      return json({ error: 'Payment signature verification failed' }, 400);
    }

    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. The order must be one we created.
    const { data: payment, error: payLookupErr } = await db
      .from('payments')
      .select('*')
      .eq('razorpay_order_id', orderId)
      .maybeSingle();
    if (payLookupErr) {
      console.error('verify-payment: payment lookup failed', payLookupErr.code, payLookupErr.message);
      return json({ error: 'Could not look up the payment' }, 500);
    }
    if (!payment) return json({ error: 'Order not found' }, 404);

    // 3. Already captured: idempotent success (and make sure membership exists).
    if (payment.status === 'captured') {
      if (payment.razorpay_payment_id && payment.razorpay_payment_id !== paymentId) {
        return json({ error: 'This order was already paid with a different payment' }, 409);
      }
      await activateMembership(db, payment);
      return json({ verified: true, status: 'captured', message: 'Payment already verified' });
    }
    if (['refunded', 'partially_refunded', 'manual_paid'].includes(payment.status)) {
      return json({ error: `Payment is already ${payment.status}` }, 409);
    }

    // 4. Ask Razorpay for the real payment record; never trust the browser.
    let rp: Record<string, any>;
    try {
      const res = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: { Authorization: `Basic ${btoa(`${keyId}:${secret}`)}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      rp = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('verify-payment: Razorpay fetch failed', res.status, rp?.error?.code);
        return json({ error: 'Could not confirm the payment with the provider. Please contact the gym with your order ID.' }, 502);
      }
    } catch (e) {
      console.error('verify-payment: Razorpay request error', e instanceof Error ? e.name : 'unknown');
      return json({ error: 'Payment provider is unreachable. Please contact the gym with your order ID.' }, 502);
    }

    if (
      rp.order_id !== orderId ||
      rp.id !== paymentId ||
      rp.currency !== 'INR' ||
      rp.amount !== payment.amount_inr * 100
    ) {
      console.error('verify-payment: provider payment does not match order', { order_id: orderId });
      return json({ error: 'Payment details do not match this order' }, 400);
    }

    // 5. Record the state Razorpay reports (signature is valid at this point).
    if (rp.status === 'captured') {
      const { data: updated, error: updErr } = await db
        .from('payments')
        .update({
          status: 'captured',
          razorpay_payment_id: paymentId,
          signature_verified: true,
          payment_method: rp.method || null,
          paid_at: new Date((rp.created_at || Date.now() / 1000) * 1000).toISOString(),
        })
        .eq('id', payment.id)
        .in('status', ['created', 'authorized', 'failed'])
        .select('*')
        .maybeSingle();
      if (updErr) {
        console.error('verify-payment: update failed', updErr.code, updErr.message);
        return json({ error: 'Could not update the payment record' }, 500);
      }
      // updated === null means a concurrent webhook captured it first: fine.
      await activateMembership(db, updated ?? { ...payment, status: 'captured' });
      return json({ verified: true, status: 'captured', message: 'Payment verified' });
    }

    if (rp.status === 'authorized') {
      const { error: updErr } = await db
        .from('payments')
        .update({
          status: 'authorized',
          razorpay_payment_id: paymentId,
          signature_verified: true,
          payment_method: rp.method || null,
        })
        .eq('id', payment.id)
        .eq('status', 'created');
      if (updErr) {
        console.error('verify-payment: update failed', updErr.code, updErr.message);
        return json({ error: 'Could not update the payment record' }, 500);
      }
      return json({
        verified: true,
        status: 'authorized',
        message: 'Payment authorized; waiting for capture',
      });
    }

    // failed / created / anything else: report, change nothing.
    return json({ verified: false, status: rp.status, error: 'Payment was not completed' }, 400);
  } catch (e) {
    console.error('verify-payment: unexpected error', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'Unable to verify payment' }, 500);
  }
});

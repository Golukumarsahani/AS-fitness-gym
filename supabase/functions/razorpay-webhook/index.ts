// @ts-ignore - Deno/TS does not provide bundled types for this remote ESM module.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve(handler: (req: Request) => Promise<Response> | Response): void;
  env: {
    get(key: string): string | undefined;
  };
};

// Webhooks are server-to-server: no CORS headers are needed or sent.

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

// deno-lint-ignore no-explicit-any
async function activateMembership(db: any, payment: any): Promise<void> {
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
      if (created.error.code !== '23505') throw created.error;
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
    if (inserted.error.code !== '23505') throw inserted.error;
    const again = await db.from('memberships').select('id').eq('payment_id', payment.id).maybeSingle();
    membershipId = again.data?.id ?? null;
  }

  const link = await db
    .from('payments')
    .update({ member_id: member.id, membership_id: membershipId })
    .eq('id', payment.id);
  if (link.error) throw link.error;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const raw = await req.text(); // signature is over the exact raw body
    const signature = req.headers.get('x-razorpay-signature') || '';
    const eventId = req.headers.get('x-razorpay-event-id') || '';

    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    const url = Deno.env.get('SUPABASE_URL');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !url || !service) {
      console.error('webhook: missing server environment configuration');
      return new Response('Webhook not configured', { status: 503 });
    }

    if (!signature || !timingSafeEqual(await hmacHex(secret, raw), signature)) {
      console.warn('webhook: invalid signature');
      return new Response('Invalid signature', { status: 401 });
    }
    if (!eventId) return new Response('Missing event ID', { status: 400 });

    const payload = JSON.parse(raw);
    const db = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Idempotency: skip only events that were FULLY processed. An event that
    // was stored but failed midway is processed again on Razorpay's retry.
    const { error: insertErr } = await db.from('payment_webhook_events').insert({
      event_id: eventId,
      event_type: payload.event || 'unknown',
      payload,
    });
    if (insertErr) {
      if (insertErr.code !== '23505') throw insertErr;
      const prior = await db
        .from('payment_webhook_events')
        .select('processed_at')
        .eq('event_id', eventId)
        .maybeSingle();
      if (prior.error) throw prior.error;
      if (prior.data?.processed_at) return new Response('Duplicate event accepted', { status: 200 });
    }

    const entity = payload.payload?.payment?.entity;
    if (entity?.order_id) {
      const { data: payment, error: lookupErr } = await db
        .from('payments')
        .select('*')
        .eq('razorpay_order_id', entity.order_id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      if (!payment) {
        console.warn('webhook: no payment record for order', entity.order_id);
      } else if (entity.currency !== 'INR' || entity.amount !== payment.amount_inr * 100) {
        console.error('webhook: amount/currency mismatch; ignored', { order_id: entity.order_id });
      } else if (payload.event === 'payment.captured' && entity.status === 'captured') {
        const { data: updated, error } = await db
          .from('payments')
          .update({
            status: 'captured',
            razorpay_payment_id: entity.id,
            signature_verified: true,
            payment_method: entity.method || null,
            paid_at: new Date((entity.created_at || Date.now() / 1000) * 1000).toISOString(),
            webhook_event_id: eventId,
          })
          .eq('id', payment.id)
          .in('status', ['created', 'authorized', 'failed'])
          .select('*')
          .maybeSingle();
        if (error) throw error;
        // `updated` is null when verify-razorpay-payment captured it first.
        const current = updated ?? payment;
        if (current.status === 'captured' || updated) {
          await activateMembership(db, current);
        }
      } else if (payload.event === 'payment.authorized') {
        const { error } = await db
          .from('payments')
          .update({
            status: 'authorized',
            razorpay_payment_id: entity.id,
            payment_method: entity.method || null,
            webhook_event_id: eventId,
          })
          .eq('id', payment.id)
          .eq('status', 'created');
        if (error) throw error;
      } else if (payload.event === 'payment.failed') {
        // A failed attempt must never overwrite a captured/refunded order.
        const { error } = await db
          .from('payments')
          .update({
            status: 'failed',
            webhook_event_id: eventId,
            metadata: {
              ...(payment.metadata || {}),
              last_failure: {
                payment_id: entity.id,
                code: entity.error_code || null,
                reason: entity.error_reason || null,
              },
            },
          })
          .eq('id', payment.id)
          .in('status', ['created', 'authorized']);
        if (error) throw error;
      }
    }

    const { error: doneErr } = await db
      .from('payment_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', eventId);
    if (doneErr) throw doneErr;

    return new Response('ok', { status: 200 });
  } catch (e) {
    // 5xx makes Razorpay retry; the event row is reprocessed because it has no processed_at.
    console.error('webhook error', e instanceof Error ? e.message : 'unknown');
    return new Response('Webhook processing failed', { status: 500 });
  }
});

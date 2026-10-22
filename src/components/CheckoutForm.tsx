import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, CalendarDays, Check, Lock, ShieldCheck } from 'lucide-react';
import { publicRows } from '../lib/data';
import { inr } from '../lib/validation';
import { requireSupabase, supabase } from '../lib/supabase';
import { Link, useLocation } from 'react-router-dom';

declare global {
  interface Window {
    Razorpay?: new (options: any) => {
      open: () => void;
      on: (event: string, cb: (response: any) => void) => void;
    };
  }
}

type Status = { kind: 'info' | 'error' | 'success'; text: string } | null;

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT}"]`,
    );
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Could not load Razorpay Checkout. Check your internet connection and try again.')),
      { once: true },
    );
    if (!existing) {
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

// supabase.functions.invoke() hides the function's JSON error body inside
// error.context (a Response). Pull the real message out so users and logs see it.
async function describeInvokeError(error: any): Promise<string> {
  const name = error?.name as string | undefined;
  if (name === 'FunctionsFetchError') {
    return 'Could not reach the payment service. Check your connection and try again. (If this persists on the live site, the site address may not be allowed by the server.)';
  }
  try {
    const ctx = error?.context;
    if (ctx instanceof Response) {
      const body = await ctx.clone().json();
      if (typeof body?.error === 'string') {
        return typeof body?.ref === 'string' ? `${body.error} (ref: ${body.ref})` : body.error;
      }
    }
  } catch {
    /* fall through to the generic message */
  }
  return error?.message || 'Unable to contact the payment service.';
}

const planPrice = (p: any) =>
  Math.round(Number(p.price_inr) * (1 - Number(p.discount_percent || 0) / 100)) +
  Number(p.joining_fee_inr || 0);

export default function CheckoutForm({ initialPlan = '' }: { initialPlan?: string }) {
  const [session, setSession] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [start, setStart] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  // A ref blocks double-clicks that happen before React re-renders `busy`.
  const submitting = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data: authListener} = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    publicRows('membership_plans')
      .then((rows: any[]) => {
        if (cancelled) return;
        setPlans(rows);
        // initialPlan may be the plan's id or its name (the /join?plan= link uses the name).
        const match = rows.find((x) => x.id === initialPlan || x.name === initialPlan);
        setPlanId(match ? match.id : rows[0]?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'error', text: 'Could not load plans. Please contact the gym.' });
      })
      .finally(() => {
        if (!cancelled) setPlansLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialPlan]);

  const finish = (next: Status) => {
    setStatus(next);
    setBusy(false);
    submitting.current = false;
  };

  const checkout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || paid) return;
    setStatus(null);

    if (!session?.user) return setStatus({ kind: 'error', text: 'Please sign in with Google before buying a membership.' });
    if (!planId) return setStatus({ kind: 'error', text: 'No active online membership plan is available.' });
    if (name.trim().length < 2) return setStatus({ kind: 'error', text: 'Please enter your full name.' });
    if (phone.trim().length < 8) return setStatus({ kind: 'error', text: 'Please enter a valid phone number.' });
    if (!consent) return setStatus({ kind: 'error', text: 'Please accept the privacy notice.' });

    submitting.current = true;
    setBusy(true);

    try {
      const client = requireSupabase();

      // 1. Create the order on the server. planId is membership_plans.id (UUID).
      const { data, error } = await client.functions.invoke('create-razorpay-order', {
        body: {
          plan_id: planId,
          full_name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          preferred_start_date: start || null,
          consent: true,
          auth_user_id: session.user.id,
        },
      });
      if (error) throw new Error(await describeInvokeError(error));
      if (!data?.order_id || !data?.key_id) {
        throw new Error(data?.error || 'The payment service did not return an order. Please try again.');
      }

      // 2. Load Razorpay Checkout and open it with the server's order + public key.
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');

      const orderId: string = data.order_id;
      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: orderId,
        name: 'AS FITNESS GYM',
        description: `Membership: ${data.plan_name}`,
        prefill: { name: name.trim(), contact: phone.trim(), email: email.trim() },
        theme: { color: '#D71920' },
        modal: {
          ondismiss: () =>
            finish({
              kind: 'info',
              text: 'Checkout closed. No payment was taken and no membership was activated. You can try again any time.',
            }),
        },
        // 3. Success callback: only a *request* for server-side verification.
        handler: async (response: any) => {
          setStatus({ kind: 'info', text: 'Payment received. Verifying securely…' });
          try {
            const { data: verified, error: verifyError } = await client.functions.invoke(
              'verify-razorpay-payment',
              {
                body: {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              },
            );
            if (verifyError) throw new Error(await describeInvokeError(verifyError));
            if (!verified?.verified) throw new Error(verified?.error || 'Verification could not be completed.');

            setPaid(true);
            finish(
              verified.status === 'captured'
                ? { kind: 'success', text: 'Payment verified. Your membership is being activated — thank you!' }
                : { kind: 'info', text: 'Payment received. We are waiting for the bank to confirm it; your membership will activate automatically once confirmed.' },
            );
          } catch (err) {
            finish({
              kind: 'error',
              text: `${err instanceof Error ? err.message : 'Payment verification failed.'} If money was deducted, do not pay again — contact the gym with order ID ${orderId}.`,
            });
          }
        },
      });

      // Payment failed inside the Razorpay window (card declined, etc.). The user can retry there.
      rzp.on('payment.failed', (resp: any) => {
        setStatus({
          kind: 'error',
          text: `Payment failed: ${resp?.error?.description || 'the payment was declined'}. You can retry in the payment window.`,
        });
      });

      rzp.open(); // `busy` stays true until the window closes or verification ends
    } catch (err) {
      finish({ kind: 'error', text: err instanceof Error ? err.message : 'Could not start checkout.' });
    }
  };

  const noPlans = plansLoaded && plans.length === 0;
  const selected = plans.find((p) => p.id === planId);
  const locked = busy || paid;

  const base = selected ? Math.round(Number(selected.price_inr) * (1 - Number(selected.discount_percent || 0) / 100)) : 0;
  const joining = selected ? Number(selected.joining_fee_inr || 0) : 0;
  const discount = selected ? Number(selected.price_inr) - base : 0;
  const total = base + joining;
  const duration = (p: any) => p.duration_label || `${p.duration_days || 30} days`;
  const benefits = (p: any): string[] => (Array.isArray(p.benefits) ? p.benefits.slice(0, 3) : []);

  if (!session) {
    const signIn = async () => { const client = requireSupabase(); const next = `${window.location.pathname}${window.location.search}`; const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${next}`, queryParams: { prompt: 'select_account' } } }); if (error) setStatus({kind:'error', text:error.message}); };
    return <div className="checkout-login-card"><h2>Login required to buy a membership</h2><p>Browse plans freely. Continue with Google to securely purchase your selected plan. After login, you will return to this checkout.</p><button type="button" className="btn btn-red" onClick={signIn}>Continue with Google</button>{status && <p className="status-error">{status.text}</p>}<p><Link className="text-link" to="/membership">Back to all plans</Link></p></div>;
  }

  return (
    <form className="checkout" onSubmit={checkout} aria-busy={busy}>
      <div className="checkout-main">
        <section className="co-card">
          <header className="co-head">
            <span className="co-step">1</span>
            <div>
              <h2>Choose your membership</h2>
              <p>Pick the plan that fits your goals.</p>
            </div>
          </header>

          {!plansLoaded && <p className="co-muted">Loading plans…</p>}
          {noPlans && <p className="co-muted">No online membership plans are available right now. Please contact the gym.</p>}

          <div className="co-plans" role="radiogroup" aria-label="Membership plan">
            {plans.map((p) => {
              const on = p.id === planId;
              const price = planPrice(p);
              return (
                <label key={p.id} className={on ? 'co-plan co-plan-on' : 'co-plan'}>
                  <input type="radio" name="plan" value={p.id} checked={on} onChange={() => setPlanId(p.id)} disabled={locked} />
                  <span className="co-plan-check">{on && <Check size={14} />}</span>
                  <span className="co-plan-body">
                    <span className="co-plan-top">
                      <b className="co-plan-name">{p.name}</b>
                      {p.is_featured && <em className="co-badge">POPULAR</em>}
                    </span>
                    <span className="co-plan-duration">{duration(p)}</span>
                    {benefits(p).length > 0 && (
                      <span className="co-plan-benefits">
                        {benefits(p).map((b) => <span key={b}><BadgeCheck size={12} /> {b}</span>)}
                      </span>
                    )}
                  </span>
                  <span className="co-plan-price">{inr(price)}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="co-card">
          <header className="co-head">
            <span className="co-step">2</span>
            <div>
              <h2>Your details</h2>
              <p>We use these to set up your membership.</p>
            </div>
          </header>
          <div className="form-grid">
            <label>
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} autoComplete="name" disabled={locked} required />
            </label>
            <label>
              Phone number
              <input value={phone} onChange={(e) => setPhone(e.target.value)} minLength={8} maxLength={20} inputMode="tel" autoComplete="tel" disabled={locked} required />
            </label>
            <label>
              Email (optional)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={locked} />
            </label>
            <label>
              Preferred start date
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={locked} />
            </label>
            <label className="consent span-two">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={locked} /> I consent to AS FITNESS GYM using these details to manage my membership enquiry and payment.
            </label>
          </div>
        </section>
      </div>

      <aside className="checkout-side">
        <div className="co-card co-summary">
          <header className="co-head">
            <span className="co-step">3</span>
            <div>
              <h2>Order summary</h2>
              <p>Review and pay securely.</p>
            </div>
          </header>

          {selected ? (
            <>
              <div className="co-sum-plan">
                <b>{selected.name}</b>
                <span>{duration(selected)}</span>
              </div>
              <dl className="co-lines">
                <div><dt>Membership</dt><dd>{inr(Number(selected.price_inr))}</dd></div>
                {discount > 0 && <div className="co-save"><dt>Discount ({Number(selected.discount_percent)}%)</dt><dd>− {inr(discount)}</dd></div>}
                {joining > 0 && <div><dt>Joining fee</dt><dd>{inr(joining)}</dd></div>}
                <div className="co-total"><dt>Total today</dt><dd>{inr(total)}</dd></div>
              </dl>
              <p className="co-when"><CalendarDays size={14} /> {start ? `Starts ${new Date(`${start}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Starts as soon as payment is verified'}</p>
            </>
          ) : (
            <p className="co-muted">Select a plan to see your total.</p>
          )}

          <button className="btn btn-red btn-full co-pay" disabled={locked || !plansLoaded || noPlans || !selected}>
            {busy ? 'Preparing secure checkout…' : paid ? 'Payment complete' : <><Lock size={15} /> Process Checkout{selected ? ` — ${inr(total)}` : ''}</>}
          </button>

          <div className="secure-note">
            <ShieldCheck size={16} /> Payment verification runs on the server. Card details are handled by Razorpay.
          </div>

          {status && (
            <p role={status.kind === 'error' ? 'alert' : 'status'} className="form-status co-status" data-kind={status.kind}>
              {status.text}
            </p>
          )}

          <p className="fine-print">Membership activates only after verified payment capture.</p>
        </div>
      </aside>
    </form>
  );
}

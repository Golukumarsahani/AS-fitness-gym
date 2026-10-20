# AS FITNESS GYM — Razorpay checkout: setup, deploy, test

## Where each value goes

| Value | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` / hosting env vars (frontend) | Public by design. |
| `VITE_RAZORPAY_KEY_ID` | optional | The checkout now uses the key id returned by the server, so this is no longer required. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | **Supabase secrets only** | Test keys first (`rzp_test_…`). |
| `RAZORPAY_WEBHOOK_SECRET` | **Supabase secret** | Any strong random string; paste the same string in the Razorpay webhook form. |
| `ALLOWED_ORIGINS` | **Supabase secret** | Comma-separated production site origins, e.g. `https://www.yourgym.com,https://yourgym.com`. `localhost:5173` is always allowed. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Do not set** | Supabase injects these into every Edge Function automatically. Overriding them with a wrong value is the classic cause of plan-lookup failures. |

Never put the Razorpay secret or the service-role key in a `VITE_` variable or in the repo (`.env.local` must be git-ignored).

## Deploy

```bash
supabase link --project-ref icfluvbpqebzziepdgul
supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx ALLOWED_ORIGINS=https://your-site.com
supabase db push          # applies 202610200001_payment_flow_grants.sql and 202610200002_member_payment_status.sql (idempotent, no data loss)
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook
```

Webhook (Razorpay Dashboard → Test Mode → Settings → Webhooks):
URL `https://icfluvbpqebzziepdgul.supabase.co/functions/v1/razorpay-webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`,
events `payment.authorized`, `payment.captured`, `payment.failed`.

## Test (Razorpay TEST mode first)

1. Razorpay Dashboard in **Test Mode**; use `rzp_test_` keys everywhere.
2. `npm run dev`, open `/join`, choose `monthly-test`, fill the form, tick consent, **Continue to secure payment**.
3. Pay with Razorpay's test card/UPI (`success@razorpay`). Use `failure@razorpay` to test failure.
4. SQL editor:
   `select status, signature_verified, razorpay_payment_id, paid_at from payments order by created_at desc limit 3;`
   → `captured`, `true`, a `pay_…` id. Then `select * from memberships order by created_at desc limit 1;` shows one active membership.
5. Close the Razorpay window → no payment row change, no membership. Resend the webhook from the Razorpay dashboard → still exactly one membership.

## Go live (only after every box above passes)

Swap `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` to `rzp_live_` keys, create the webhook again in Live Mode with its own secret, redeploy not required (secrets apply on next invocation), make one real ₹1 payment, then set `monthly-test` to `is_active=false`.

## Debugging

Supabase → Edge Functions → `create-razorpay-order` → Logs. Every failure logs a specific line (`plan lookup DB error`, `no plan with that id`, `enquiry insert failed`, …) with the error code and the Supabase host the function is talking to (compare with `icfluvbpqebzziepdgul`).

## "Could not load the membership plan (ref: plan_lookup_failed/…)"

The text in brackets tells you the cause:

- `…/permission_denied/42501` → the server role has no access to the tables. Run the two migration files
  (`202610200001_payment_flow_grants.sql`, then `202610200002_member_payment_status.sql`) in Supabase → SQL Editor, then try again.
- `…/invalid_service_key/…` → the function is not using the project's real service-role key. Do not set `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` as secrets
  (delete them if you did: `supabase secrets unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY`) and redeploy the function.
- anything else → open the function logs; the matching line shows the full database error.

## Admin → Members (paid / unpaid / 30-day expiry)

- **Add member**: for gym members who did not pay online. Choose *Unpaid* (pay later) or *Paid* (already received: amount, cash/UPI/bank, validity days).
- **Mark paid**: when an unpaid member pays, press it. Validity starts on the date you choose (default today) and lasts the plan's days (30 for a monthly plan).
- Paid memberships turn **Expired** automatically after the end date (computed on screen, saved to the database when the page opens, and nightly if pg_cron is available).
- **Renew**: shown for expired members (and for paid members in their last 7 days).
- Online Razorpay payments appear here as **Paid** (Added via: Online) after the server verifies them.
- Manual payments are stored in `payments` with status `manual_paid`, so Reports counts them.

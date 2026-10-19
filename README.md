# AS FITNESS GYM — Website & Owner Dashboard

A React + TypeScript + Vite + Tailwind CSS application for the AS FITNESS GYM public website and owner-only management area. Supabase provides PostgreSQL, authentication, Row Level Security and image storage. Razorpay order creation, payment verification and webhook handling are implemented as Supabase Edge Functions.

> **Integration status:** the source code and configuration templates are included, but this project has not been connected to your Supabase or Razorpay accounts. Live credentials, domain, actual business details, legal copy and end-to-end payment tests must be supplied by the owner. Never use production payments until test-mode verification is complete.

## Features included

- Responsive red-and-white public website: Home, About, Facilities, Trainers, Membership, Gallery, Contact, Join, Privacy, Terms, Membership Terms and Cancellation/Refund draft pages.
- Dynamic membership plans, trainers, facilities, gallery and opening hours loaded from Supabase.
- Enquiry submission through a server-side Edge Function with validation and consent.
- Owner login with Supabase Auth, owner allowlist check, no public signup, password reset, and protected dashboard routes.
- Owner dashboard and management views for members, plans, enquiries, payments, timings, gallery, trainers, facilities, social links, website content, reports and account settings. Search and CSV export are included where applicable.
- Supabase SQL migration with schema, constraints, indexes, triggers, RLS and storage policies.
- Razorpay order creation using the current server-side plan price; Checkout integration; server signature verification; webhook signature verification using the raw request body; duplicate webhook event idempotency; captured/failed payment updates; membership creation on captured webhook.
- `.env.example`, tests, robots.txt and a sitemap template.

## Requirements

- Node.js 20.19+ or 22.12+ (Node 22 LTS recommended)
- npm
- A Supabase project
- A Razorpay account for online payments (start with test mode)
- Supabase CLI for migration/function deployment (optional but recommended)

## Run locally

1. Extract the ZIP and open a terminal in `as-fitness-gym/`.
2. Install packages:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and set the **public** values:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
   VITE_RAZORPAY_KEY_ID=rzp_test_your_key_id
   VITE_SITE_URL=http://localhost:5173
   ```

   Do not put service-role keys or Razorpay secret keys in `.env` values prefixed with `VITE_`.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL Vite prints. The public site can render with no backend configured, but database-backed data and form submissions require Supabase.

## Supabase setup

1. Create a Supabase project and keep its project URL and publishable/anon key for the frontend environment.
2. Install and authenticate the Supabase CLI, then link the project:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Alternatively, run `supabase/migrations/202610180001_initial_schema.sql` in the Supabase SQL Editor. Run it once per fresh database. Review policies before applying to an existing production database.
3. In Supabase Authentication, enable email/password sign-in. Disable public signups in the Auth settings. Set your site URL and allowed redirect URLs (local and production) so password reset works.
4. Create the first owner account through Supabase Dashboard → Authentication → Users → Add user. Do not create a public owner registration route and do not hardcode a password.
5. Copy the newly created user's UUID from Auth and add the owner allowlist row in SQL Editor:

   ```sql
   insert into public.owner_profiles(user_id, display_name)
   values ('PASTE_AUTH_USER_UUID_HERE', 'Gym Owner');
   ```

   This SQL editor step is intentionally privileged. The owner profile table has no public insert policy, so users cannot grant themselves owner access from the browser. Never add an owner-profile insert policy for `anon` or ordinary authenticated users.
6. Confirm the user can sign in at `/admin`. If the account is not allowlisted, the app shows an access-denied screen. RLS independently protects private tables; a frontend route guard alone is not treated as security.
7. In Storage, the migration creates the `gym-gallery` public-read bucket for published photos and restricts uploads, updates and deletes to allowlisted owners. Do not upload sensitive/private images to this bucket.
8. Populate active membership plans and actual gym details from `/admin`. The migration intentionally does not invent prices, trainer profiles, testimonials or contact information. Update default opening hours to the actual schedule before publishing.

## Razorpay configuration

1. Create/activate a Razorpay merchant account and start in **test mode**. Copy the test Key ID and Key Secret from the Razorpay Dashboard.
2. Deploy Edge Functions and configure secrets on Supabase, not in the browser:

   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_REPLACE_ME
   supabase secrets set RAZORPAY_KEY_SECRET=REPLACE_ME
   supabase secrets set RAZORPAY_WEBHOOK_SECRET=REPLACE_ME
   supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   ```

   Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in deployed Edge Function environments in typical projects; configure/confirm them according to your project setup. Service-role keys bypass RLS and must remain server-only.
3. Deploy functions:

   ```bash
   supabase functions deploy submit-enquiry
   supabase functions deploy create-razorpay-order
   supabase functions deploy verify-razorpay-payment
   supabase functions deploy razorpay-webhook
   ```

   The public enquiry and checkout functions do not require an end-user Supabase session; they validate inputs server-side. If deploying with `--no-verify-jwt`, do so only for these specific public endpoints and retain their validation/abuse protections. Otherwise configure gateway JWT behavior to match the public form flow.
4. In Razorpay Dashboard → Webhooks, configure the deployed `razorpay-webhook` URL, set the exact webhook secret, and subscribe to `payment.captured` and `payment.failed`. The function checks the raw body signature and `x-razorpay-event-id`; duplicate deliveries are acknowledged idempotently.
5. Set `VITE_RAZORPAY_KEY_ID` to the matching test Key ID, run the frontend and test the full flow using Razorpay test credentials/methods. A browser success callback alone does not activate membership: backend verification and captured webhook processing are required.
6. After full test-mode validation, switch to live keys only in Supabase secrets and frontend public Key ID, configure the live webhook separately, deploy over HTTPS, and test a low-value transaction. Never commit keys or share them in chat.

### Payment/membership behavior and review points

- Order amount is loaded from an active plan in Supabase, not accepted from the browser.
- Amount is stored in INR whole-rupee units and converted to paise for Razorpay.
- Payment signature and order/payment amount/currency are checked server-side. Webhooks are authenticated using the raw request body.
- Duplicate webhook event IDs are ignored. Memberships have a unique `payment_id` to prevent duplicate activation.
- A captured webhook creates/links a member and creates a membership using the plan snapshot captured at order creation. If a customer chooses a preferred future start date, the implementation uses it as the membership start date; confirm that this matches your business policy before production.
- Refund status is represented in the schema, but automated refund initiation and authoritative refund-event processing are not implemented. Reconcile refunds through the provider and update records only after verification.
- Cash/UPI/manual payment recording is represented in the data model but a dedicated audited manual-receipt workflow is not yet implemented.
- Add production rate limiting/CAPTCHA, alerting, stricter phone normalization, operational audit events and a refund reconciliation process before public launch.

## Tests and build

```bash
npm test
npm run build
```

The included Vitest tests cover enquiry validation and INR formatting. Build/test results are environment-dependent and should be rerun after installation. Database RLS, auth, uploads, deployed Edge Functions, Razorpay Checkout/webhooks and end-to-end membership activation require a configured Supabase project and Razorpay test account; they are not certified by frontend unit tests. Add integration tests against a disposable Supabase project before launch.

## Deployment (Vercel + Supabase)

1. Push the source to a private or public Git repository (never commit `.env`).
2. Import the repository in Vercel. Framework preset: Vite. Build command `npm run build`; output directory `dist`.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RAZORPAY_KEY_ID`, and `VITE_SITE_URL` in Vercel project environment variables for the right deployment environments.
4. Configure SPA rewrites so direct visits to `/admin`, `/membership`, etc. serve `index.html`. A basic `vercel.json` is included.
5. Configure production Supabase Auth redirect URLs and Razorpay webhook URL; force HTTPS.
6. Replace `YOUR_DOMAIN.example` in `public/sitemap.xml` and `public/robots.txt` with your actual domain and update Open Graph/canonical metadata as appropriate.
7. Review legal policy drafts with a qualified adviser, replace illustrative copy and imagery as needed, and verify rights for all images used.

## Current limitations to resolve before claiming production readiness

- No live Supabase or Razorpay credentials were supplied, so cloud integrations have not been exercised in this environment.
- Owner CRUD is provided for core entities, but the dashboard's broad tables are generic management screens; advanced member renewal/history workflows, full holiday calendar UI, section visibility controls, dedicated testimonial editor, member profile detail view, pagination, richer date/status filters and audited manual-payment entry still need dedicated screens.
- Gallery upload supports single-image upload per selection (repeat to upload more); bulk multi-select, reorder controls, replace-image UI and upload progress are not implemented yet.
- Reports are a useful basic summary/export, not a complete date-filtered analytics suite; refund/net revenue calculations need verified refund data.
- Policy pages are drafts and not legal advice. Sample remote Unsplash photography is for layout preview; replace with licensed gym photography before production.
- The migration's public gallery bucket is public-read by design. Keep private/member documents out of it.

## Scripts

- `npm run dev` — development server
- `npm run build` — TypeScript + production Vite build
- `npm run preview` — serve production build locally
- `npm test` — unit tests
"# AS-fitness-gym" 

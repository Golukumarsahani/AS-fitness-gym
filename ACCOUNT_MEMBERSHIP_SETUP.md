# AS Fitness Gym — Google login and profile setup

## What changed
- Public pages and membership plans remain viewable without login.
- The checkout (`/join`) asks the customer to Continue with Google before purchase.
- After OAuth, the customer returns to the selected checkout URL.
- Header includes Login / My Profile; `/profile` displays the linked member and membership history/expiry.
- Payment order creation validates the Supabase access token on the server. Verified payment activation links the member record to the authenticated user where possible.
- Logging out only ends the session. It does not delete `members`, `memberships`, or `payments` rows.

## Before deploying
1. Copy `.env.example` to `.env.local` and fill in your existing Supabase URL and anon key. Do not share `.env.local` or commit it.
2. In Supabase SQL Editor, run `supabase/migrations/202610220001_google_account_profile.sql`.
3. Supabase Authentication → Providers → Google must be enabled.
4. Add these redirect URLs in Supabase Auth URL Configuration:
   - `https://as-fitness-gym.netlify.app/**`
   - `http://localhost:5173/**`
   Make sure your Google OAuth client uses the Supabase callback URL shown in the Supabase Google provider settings.
5. Redeploy the Edge Functions so the server-side auth and member linking changes take effect:
   ```bash
   npx supabase functions deploy create-razorpay-order --project-ref icfluvbpqebzziepdgul
   npx supabase functions deploy verify-razorpay-payment --project-ref icfluvbpqebzziepdgul
   npx supabase functions deploy razorpay-webhook --project-ref icfluvbpqebzziepdgul
   ```
6. Deploy the website to Netlify, then test Google login, a successful test payment, `/profile`, logout/login, and expiry display.

## Existing member records
The SQL migration does not delete or reset any existing records. Existing member records with an email matching the verified Google account can be read in the profile (subject to RLS). On a verified online purchase, the server links an unlinked phone-matched member to the signed-in Google account. If the old member has a different linked account or mismatched email/phone, have the gym owner reconcile that record instead of creating or linking records blindly.

## Important
This ZIP is source code. The deployment and live Supabase/Google/Razorpay configuration still need to be applied and tested in your accounts. Never put the Supabase service-role key or Razorpay secret in frontend environment variables.

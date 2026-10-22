# AS FITNESS GYM — Public plans and login-before-checkout

## Expected behavior
- Visitors can browse the public site and active membership plans without signing in.
- Selecting a plan opens `/join?plan=...`.
- If logged out, `/join` displays **Login please to continue**, preserving the selected plan in the return URL.
- After Google sign-in, the user returns to that selected plan's checkout.
- The owner-only `/admin` authorization remains separate; Google sign-in alone does not grant owner access.

## Required Supabase SQL
If membership plans currently disappear for logged-out visitors, run `supabase/manual/allow-public-membership-plans.sql` in Supabase Dashboard → SQL Editor → New query. It grants read-only access to rows where `is_active = true` only. It does not expose inactive plans or allow writes.

## Build and deploy
1. Copy/merge this source into your project, preserving your real `.env.local` separately (do not put secrets in the ZIP or Git).
2. Run `npm install` then `npm run build`.
3. Commit/push the changes to the GitHub repository connected to Netlify, or upload the built `dist` directory using Netlify's manual deploy UI.
4. Verify while logged out: homepage and `/membership` show active plans; click a plan, login, and confirm return to `/join?plan=...`.

Supabase public environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) must be set in the local `.env.local` and Netlify site environment variables. Never put Supabase service-role keys or Razorpay secrets in frontend variables.

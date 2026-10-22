-- Link each online gym member to the Google/Supabase account used at checkout.
-- Safe to run repeatedly; existing members and memberships are preserved.
alter table public.members add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists members_auth_user_id_unique
  on public.members(auth_user_id) where auth_user_id is not null;

-- The website requires a signed-in user before creating a Razorpay order.
-- The Edge Functions use the service role only on the server and validate the caller JWT.

-- Paid / Unpaid / Expired tracking for the admin Members page.
-- No tables or columns change and nothing is deleted. Safe to run more than once.
--
-- How a member's status is derived (memberships table, already in your schema):
--   status = 'pending'            -> UNPAID   (owner added the member, payment not received yet)
--   status = 'active'             -> PAID     (until end_date)
--   status = 'expired'            -> EXPIRED  (end_date has passed)
--   payments.status = 'manual_paid' -> payment the owner recorded by hand (cash / UPI / bank)
--   payments.status = 'captured'    -> online Razorpay payment, verified by the server

-- Moves every paid membership whose end_date has passed to 'expired'.
-- Uses India time so a membership ends at midnight IST.
create or replace function public.expire_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.memberships
     set status = 'expired'
   where status = 'active'
     and end_date < (now() at time zone 'Asia/Kolkata')::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_memberships() from public;
revoke all on function public.expire_memberships() from anon;
grant execute on function public.expire_memberships() to authenticated, service_role;

-- Optional: run it automatically every night at 00:05 IST (18:35 UTC) if pg_cron is available.
-- If your project does not allow this, nothing breaks: the admin page also expires memberships
-- every time it is opened, and shows "Expired" from the dates regardless.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'expire-memberships-nightly',
    '35 18 * * *',
    'select public.expire_memberships();'
  );
exception when others then
  raise notice 'pg_cron not enabled; skipping nightly schedule (%).', sqlerrm;
end
$$;

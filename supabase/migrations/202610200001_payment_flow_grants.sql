-- Payment flow hardening. Safe to run more than once; changes no data and drops nothing.
--
-- The checkout code needs NO schema change: every column it uses already exists
-- in 202610180001_initial_schema.sql. This only makes sure the server-side
-- `service_role` (used by the Edge Functions) can read/write the payment tables.
-- The service role bypasses RLS but still needs table privileges; a missing GRANT
-- shows up as "permission denied for table <name>".

grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.membership_plans,
  public.enquiries,
  public.members,
  public.memberships,
  public.payments,
  public.payment_webhook_events
to service_role;

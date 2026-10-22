-- AS FITNESS GYM: let visitors see active membership plans before login.
-- Safe to run more than once. This grants read-only access to active plans only.
-- It does NOT grant public insert/update/delete access and does not affect admin access.

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.membership_plans TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read active membership plans" ON public.membership_plans;
CREATE POLICY "Public can read active membership plans"
ON public.membership_plans
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Link a member record to the authenticated Google/Supabase user.
-- Existing memberships and payment records are preserved.
alter table public.members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists members_auth_user_id_unique
  on public.members(auth_user_id) where auth_user_id is not null;

create index if not exists memberships_member_created_idx
  on public.memberships(member_id, created_at desc);

-- Profile page reads only the signed-in user's linked member and memberships.
alter table public.members enable row level security;
alter table public.memberships enable row level security;
drop policy if exists "Members can read own profile" on public.members;
create policy "Members can read own profile" on public.members
  for select to authenticated using (
    auth_user_id = auth.uid()
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
drop policy if exists "Members can read own memberships" on public.memberships;
create policy "Members can read own memberships" on public.memberships
  for select to authenticated using (exists (
    select 1 from public.members m where m.id = memberships.member_id and m.auth_user_id = auth.uid()
  ));

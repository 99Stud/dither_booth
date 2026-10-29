-- Platform admins and team roles. A platform admin (99Stud) sees every
-- team, booth and alert; a member still sees only their team. Being one is
-- a row, not a role, so it can't be confused with a team's roles below.
--
-- Admins get no push: devices still follow org_member, so an admin's phone
-- only rings for the teams they belong to.

create table public.platform_admin (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admin enable row level security;

-- A user only learns whether they are one. Admins are added from the SQL
-- editor for now: there is no insert grant.
create policy "users read their own admin row" on public.platform_admin
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.platform_admin from anon, authenticated;
grant select on public.platform_admin to authenticated;
grant select, insert, update, delete on public.platform_admin to service_role;

-- Whether the caller is a platform admin. Reads platform_admin under its own
-- policy, which only shows the caller's row.
create function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admin where user_id = (select auth.uid())
  )
$$;

-- The teams the caller may see: their own, or every team for an admin.
-- Policies use it as `org_id in (select public.visible_org_ids())`, an
-- uncorrelated set Postgres works out once per statement.
--
-- org and org_member's own policies must not call it: it reads both, and
-- would recurse.
create function public.visible_org_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select org_id from public.org_member where user_id = (select auth.uid())
  union
  select id from public.org where (select public.is_platform_admin())
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.visible_org_ids() from public, anon;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.visible_org_ids() to authenticated, service_role;

-- The anchors: they read memberships directly.
alter policy "members read their own membership" on public.org_member
  using ((select public.is_platform_admin()) or user_id = (select auth.uid()));

alter policy "members read their orgs" on public.org
  using (
    (select public.is_platform_admin())
    or id in (select org_id from public.org_member where user_id = (select auth.uid()))
  );

-- Everything else follows the visible teams.
alter policy "members read their booths" on public.booth
  using (org_id in (select public.visible_org_ids()));

alter policy "members add booths to their orgs" on public.booth
  with check (org_id in (select public.visible_org_ids()));

alter policy "members change their booths" on public.booth
  using (org_id in (select public.visible_org_ids()))
  with check (org_id in (select public.visible_org_ids()));

alter policy "members read their booths' status" on public.booth_status
  using (org_id in (select public.visible_org_ids()));

alter policy "members read their alerts" on public.alert
  using (org_id in (select public.visible_org_ids()));

alter policy "members ack their alerts" on public.alert
  using (org_id in (select public.visible_org_ids()))
  with check (org_id in (select public.visible_org_ids()));

alter policy "members read their booths' updates" on public.booth_update
  using (org_id in (select public.visible_org_ids()));

alter policy "members ask their booths to update" on public.booth_update
  with check (org_id in (select public.visible_org_ids()));

alter policy "members ask again" on public.booth_update
  using (org_id in (select public.visible_org_ids()))
  with check (org_id in (select public.visible_org_ids()));

alter policy "members cancel" on public.booth_update
  using (org_id in (select public.visible_org_ids()));

-- "members add their own devices" stays on memberships: a device of an
-- admin's that named any team would get that team's alerts.

-- Admins add teams (Studio's Teams screen, later).
create policy "admins add orgs" on public.org
  for insert to authenticated
  with check ((select public.is_platform_admin()));

grant insert (name) on public.org to authenticated;

-- Team roles. "Staff" stays the product word for 99Stud people; on a team
-- they are members, and an owner will also manage the team's members (no
-- policy reads the role yet).
alter table public.org_member drop constraint org_member_role_check;
update public.org_member set role = 'member' where role = 'staff';
alter table public.org_member
  alter column role set default 'member',
  add constraint org_member_role_check check (role in ('owner', 'member'));

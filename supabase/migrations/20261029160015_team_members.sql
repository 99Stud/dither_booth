-- Studio's Team: owners and platform admins add and remove a team's members
-- through the team Edge Function, which holds the rules and the Auth calls.
-- Nothing here grants writes on org_member: the function writes with the
-- service role.
--
-- Devices follow membership. A device is one member's, on one team: removing
-- the member from the team removes their devices on it, so a removed
-- person's phones stop getting that team's alerts.

do $$
declare
  orphans integer;
begin
  delete from public.push_subscription d
  where not exists (
    select 1 from public.org_member m
    where m.org_id = d.org_id and m.user_id = d.user_id
  );
  get diagnostics orphans = row_count;
  raise notice 'removed % device(s) of people no longer in their team', orphans;
end
$$;

alter table public.push_subscription
  add constraint push_subscription_member_fkey
  foreign key (org_id, user_id)
  references public.org_member (org_id, user_id)
  on delete cascade;

-- The key's index also serves notify's lookup by team.
create index push_subscription_org_id_user_id_idx
  on public.push_subscription (org_id, user_id);
drop index public.push_subscription_org_id_idx;

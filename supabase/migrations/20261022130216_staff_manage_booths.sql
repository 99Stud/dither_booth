-- What Studio lets staff do with their booths: add one (its name), and set
-- its event times (live_from, live_until), when its silence is an alert.
-- Nothing else on a booth: its registration stays the Hub's (register-booth,
-- and booth-code for a new code).

grant insert (org_id, name) on public.booth to authenticated;
grant update (live_from, live_until) on public.booth to authenticated;

create policy "members add booths to their orgs" on public.booth
  for insert to authenticated
  with check (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members change their booths" on public.booth
  for update to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())))
  with check (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

-- Studio shows alerts and booth status as they change. Realtime applies the
-- tables' row level security, so staff only hear about their own orgs.
alter publication supabase_realtime add table public.alert, public.booth_status;

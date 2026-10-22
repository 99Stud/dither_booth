-- What staff may do with booths from Studio: add one, set its event times;
-- never touch a registration, nor another org's booth.
begin;
select plan(11);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a@example.com'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'staff-b@example.com');
insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Org B');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name) values
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Booth B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$insert into public.booth (org_id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A') returning name$$,
  array['Booth A'], 'staff add a booth to their org');
select throws_ok(
  $$insert into public.booth (org_id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'Sneaky')$$,
  '42501', null, 'but not to another org');
select throws_ok(
  $$insert into public.booth (org_id, name, auth_user_id) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'X', 'a1a1a1a1-0000-0000-0000-000000000001')$$,
  '42501', null, 'nor set its Auth user');
select throws_ok(
  $$insert into public.booth (org_id, name, registration_code_hash, registration_expires_at) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'X', 'abc', now())$$,
  '42501', null, 'nor its registration code');

select results_eq(
  $$update public.booth set live_from = '2026-10-31 18:00+00', live_until = '2026-11-01 02:00+00'
    where name = 'Booth A' returning live_from$$,
  array['2026-10-31 18:00+00'::timestamptz], 'staff set their booth''s event times');
select throws_ok(
  $$update public.booth set name = 'Booth A, foyer' where name = 'Booth A'$$,
  '42501', null, 'but not rename it (Studio has no rename)');
select throws_ok(
  $$update public.booth set registered_at = now() where name = 'Booth A'$$,
  '42501', null, 'nor its registration');
select is_empty(
  $$update public.booth set live_from = null, live_until = null where id = 'b0b0b0b0-0000-0000-0000-0000000000b0' returning id$$,
  'and not another org''s booth');
select throws_ok(
  $$update public.booth set live_from = '2026-11-01 02:00+00', live_until = '2026-10-31 18:00+00' where name = 'Booth A'$$,
  '23514', null, 'event times that end before they start are refused');

reset role;
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'alert'),
  'alerts are published to Realtime');
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'booth_status'),
  'so is booth status');

select * from finish();
rollback;

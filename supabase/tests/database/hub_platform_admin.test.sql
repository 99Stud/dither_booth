-- Platform admins see every team and what it owns; a member still sees only
-- their team, and a booth nothing. Being an admin is a row only the admin
-- can read, added from the SQL editor. Team roles are owner and member.
begin;
select plan(38);

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'admin@example.com'),
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a@example.com'),
  ('b00b0000-0000-0000-0000-000000000001', 'booth-a@example.com');

insert into public.platform_admin (user_id) values
  ('ad000000-0000-0000-0000-000000000001');

insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Org B');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A'),
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Booth B');
insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', now(), '{}'),
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', now(), '{}');
insert into public.alert (org_id, booth_id, key, severity) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b0b0b0b0-0000-0000-0000-0000000000b0', 'printer.paper-out', 'critical');

-- Grants, read from the catalog.
select ok(not has_table_privilege('authenticated', 'public.platform_admin', 'insert'),
  'staff cannot make anyone an admin');
select ok(not has_table_privilege('anon', 'public.platform_admin', 'select'),
  'anon cannot read admins');
select ok(has_table_privilege('service_role', 'public.platform_admin', 'select, insert, update, delete'),
  'the service role reads and writes admins');
select ok(has_function_privilege('authenticated', 'public.is_platform_admin()', 'execute'),
  'staff can ask whether they are an admin');
select ok(has_function_privilege('authenticated', 'public.visible_org_ids()', 'execute'),
  'staff can list the teams they see');
select ok(not has_function_privilege('anon', 'public.is_platform_admin()', 'execute'),
  'anon cannot call is_platform_admin');
select ok(not has_function_privilege('anon', 'public.visible_org_ids()', 'execute'),
  'anon cannot call visible_org_ids');

-- Team roles.
select is(
  (select role from public.org_member where user_id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  'member', 'a new membership is a member');
select throws_ok(
  $$insert into public.org_member (org_id, user_id, role)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a1a1a1a1-0000-0000-0000-000000000001', 'staff')$$,
  '23514', null, 'staff is no longer a role');
select lives_ok(
  $$insert into public.org_member (org_id, user_id, role)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'ad000000-0000-0000-0000-000000000001', 'owner')$$,
  'owner is a role');
delete from public.org_member where user_id = 'ad000000-0000-0000-0000-000000000001';

set local role authenticated;

-- The admin, with no membership.
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(public.is_platform_admin(), 'the admin is an admin');
select set_eq($$select public.visible_org_ids()$$,
  array['aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b']::uuid[],
  'the admin sees every team');
select is((select count(*) from public.org), 2::bigint, 'the admin reads every org');
select is((select count(*) from public.org_member), 1::bigint, 'the admin reads every membership');
select is((select count(*) from public.booth), 2::bigint, 'the admin reads every booth');
select is((select count(*) from public.booth_status), 2::bigint, 'the admin reads every booth status');
select is((select count(*) from public.alert), 2::bigint, 'the admin reads every alert');
select is((select count(*) from public.platform_admin), 1::bigint, 'the admin reads their own admin row');
select lives_ok(
  $$insert into public.org (name) values ('Client C')$$,
  'the admin adds a team');
select lives_ok(
  $$insert into public.booth (org_id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'Booth B2')$$,
  'the admin adds a booth to any team');
update public.alert set acked_at = now()
  where org_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
select is(
  (select acked_by from public.alert where org_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  'ad000000-0000-0000-0000-000000000001'::uuid, 'the admin acknowledges any alert');
update public.booth
  set live_from = '2026-10-31 18:00+00', live_until = '2026-11-01 02:00+00'
  where id = 'b0b0b0b0-0000-0000-0000-0000000000b0';
select is(
  (select live_until from public.booth where id = 'b0b0b0b0-0000-0000-0000-0000000000b0'),
  '2026-11-01 02:00+00'::timestamptz, 'the admin sets any booth''s event times');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'ad000000-0000-0000-0000-000000000001',
      'https://fcm.googleapis.com/fcm/send/admin', 'k', 'a')$$,
  '42501', null, 'an admin gets no device on a team they are not in');
select throws_ok(
  $$insert into public.platform_admin (user_id) values ('a1a1a1a1-0000-0000-0000-000000000001')$$,
  '42501', null, 'not even an admin makes admins from Studio');

-- A member of org A.
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(not public.is_platform_admin(), 'a member is not an admin');
select set_eq($$select public.visible_org_ids()$$,
  array['aaaaaaaa-0000-0000-0000-00000000000a']::uuid[],
  'a member sees their team only');
select is((select count(*) from public.org), 1::bigint, 'a member reads one org');
select is((select count(*) from public.booth), 1::bigint, 'a member reads their booth only');
select is((select count(*) from public.alert), 1::bigint, 'a member reads their alert only');
select is_empty($$select 1 from public.platform_admin$$, 'a member reads no admin row');
select throws_ok(
  $$insert into public.org (name) values ('Mine')$$,
  '42501', null, 'a member cannot add a team');

-- A booth's JWT.
select set_config('request.jwt.claims', '{"sub":"b00b0000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"booth_id":"a0a0a0a0-0000-0000-0000-0000000000a0"}}', true);
select ok(not public.is_platform_admin(), 'a booth is not an admin');
select is_empty($$select public.visible_org_ids()$$, 'a booth sees no team');
select is_empty($$select 1 from public.booth$$, 'a booth reads no booth row');
select is_empty($$select 1 from public.org_member$$, 'a booth reads no membership');
select is_empty($$select 1 from public.org$$, 'a booth reads no org');
select is_empty($$select 1 from public.booth_status$$, 'a booth reads no booth status');
select is_empty($$select 1 from public.alert$$, 'a booth reads no alert');

select * from finish();
rollback;

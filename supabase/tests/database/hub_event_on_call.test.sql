-- On call: admins pick, for an event, which of the booth's team get its
-- alerts. alert_devices is the rule: the devices of those on call for the
-- event the alert opened in, else every device of the booth's team.
begin;
select plan(30);

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'admin@example.com'),
  ('11111111-0000-0000-0000-000000000001', 'lea@example.com'),
  ('22222222-0000-0000-0000-000000000002', 'tom@example.com'),
  ('33333333-0000-0000-0000-000000000003', 'sam@example.com'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bea@client.example');
insert into public.platform_admin (user_id) values ('ad000000-0000-0000-0000-000000000001');

-- A runs the booths; B is the client; C is another team with a booth.
insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Client B'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Org C');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', '33333333-0000-0000-0000-000000000003'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name) values
  ('a1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 1'),
  ('a2000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 2'),
  ('a3000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 3'),
  ('c1000000-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-00000000000c', 'Booth C');
-- Lea and Tom have a device each; Sam has none. Bea's is on the client's team.
insert into public.push_subscription (id, org_id, user_id, endpoint, p256dh_key, auth_secret) values
  ('d1000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/lea', 'k', 'a'),
  ('d2000000-0000-0000-0000-0000000000d2', 'aaaaaaaa-0000-0000-0000-00000000000a', '22222222-0000-0000-0000-000000000002', 'https://fcm.googleapis.com/fcm/send/tom', 'k', 'a'),
  ('d3000000-0000-0000-0000-0000000000d3', 'bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001', 'https://fcm.googleapis.com/fcm/send/bea', 'k', 'a');
-- Halloween on booth 1, for the client; Open day on booth 2, nobody on call.
insert into public.event (id, org_id, booth_id, name, starts_at, ends_at) values
  ('e1000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-0000000000a1',
    'Halloween', now() - interval '1 hour', now() + interval '3 hours'),
  ('e2000000-0000-0000-0000-0000000000e2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'a2000000-0000-0000-0000-0000000000a2',
    'Open day', now() - interval '1 hour', now() + interval '3 hours');

-- An alert on a booth, opened at a given time (resolved, so several fit).
create function pg_temp.alert(p_booth uuid, p_opened timestamptz) returns uuid language sql as $$
  insert into public.alert (org_id, booth_id, key, severity, opened_at, resolved_at)
  values ('aaaaaaaa-0000-0000-0000-00000000000a', p_booth, 'printer.paper-out', 'critical', p_opened, p_opened)
  returning id
$$;

-- Who an alert reaches, by device endpoint's last segment.
create function pg_temp.reaches(p_alert uuid) returns text[] language sql as $$
  select coalesce(array_agg(split_part(endpoint, '/', 6) order by endpoint), '{}')
  from public.alert_devices(p_alert)
$$;

-- Grants and functions, read from the catalog.
select ok(not has_column_privilege('authenticated', 'public.event_on_call', 'org_id', 'insert'),
  'staff never name the team: it comes from the event');
select ok(not has_function_privilege('authenticated', 'public.alert_devices(uuid)', 'execute'),
  'staff cannot call alert_devices');
select ok(not has_function_privilege('anon', 'public.alert_devices(uuid)', 'execute'),
  'anon cannot call alert_devices');
select ok(has_function_privilege('service_role', 'public.alert_devices(uuid)', 'execute'),
  'the service role can');
select ok(exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_on_call'),
  'Realtime publishes who is on call');

set local role authenticated;

-- The admin puts people on call.
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.event_on_call (event_id, user_id)
    values ('e1000000-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001')$$,
  'an admin puts a member of the booth''s team on call');
select is(
  (select array[booth_id::text, org_id::text] from public.event_on_call where user_id = '11111111-0000-0000-0000-000000000001'),
  array['a1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a'],
  'the row takes the event''s booth and its team');
select throws_ok(
  $$insert into public.event_on_call (event_id, user_id)
    values ('e1000000-0000-0000-0000-0000000000e1', 'b1b1b1b1-0000-0000-0000-000000000001')$$,
  '23503', null, 'the client''s member is not on the booth''s team, so not on call');
select throws_ok(
  $$insert into public.event_on_call (event_id, user_id)
    values ('e1000000-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001')$$,
  '23505', null, 'someone is on call once per event');

-- A member of the team who isn't an admin.
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.event_on_call), 1::bigint, 'the booth''s team reads who is on call');
select throws_ok(
  $$insert into public.event_on_call (event_id, user_id)
    values ('e1000000-0000-0000-0000-0000000000e1', '22222222-0000-0000-0000-000000000002')$$,
  '42501', null, 'a member who isn''t an admin cannot put anyone on call, themselves included');
select is_empty(
  $$delete from public.event_on_call returning user_id$$,
  'nor take anyone off call');

-- The client's member.
select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty($$select 1 from public.event_on_call$$, 'the client does not see who is on call');

reset role;

-- The rule.
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now())),
  array['lea'], 'during the event, an alert reaches only the devices of those on call');
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now() - interval '1 hour')),
  array['lea'], 'from the event''s start');
insert into public.event_on_call (event_id, user_id) values
  ('e1000000-0000-0000-0000-0000000000e1', '33333333-0000-0000-0000-000000000003');
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now())),
  array['lea'], 'someone on call with no device adds none');
delete from public.event_on_call where user_id = '11111111-0000-0000-0000-000000000001';
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now())),
  array['lea', 'tom'], 'on call, but none of them with a device: the whole team');
delete from public.event_on_call;
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now())),
  array['lea', 'tom'], 'nobody on call: the whole team');
insert into public.event_on_call (event_id, user_id) values
  ('e1000000-0000-0000-0000-0000000000e1', '22222222-0000-0000-0000-000000000002');
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now() + interval '3 hours')),
  array['lea', 'tom'], 'an alert that opens as the event ends belongs to no event: the whole team');
select is(pg_temp.reaches(pg_temp.alert('a1000000-0000-0000-0000-0000000000a1', now() - interval '2 hours')),
  array['lea', 'tom'], 'one that opened before it, too');
select is(pg_temp.reaches(pg_temp.alert('a2000000-0000-0000-0000-0000000000a2', now())),
  array['lea', 'tom'], 'another booth''s event, with nobody on call: the whole team');
select is(pg_temp.reaches(pg_temp.alert('a3000000-0000-0000-0000-0000000000a3', now())),
  array['lea', 'tom'], 'a booth at no event: the whole team');
select is(pg_temp.reaches('00000000-0000-0000-0000-000000000000'),
  '{}'::text[], 'an alert that does not exist reaches nobody');
-- Bea's device is on the client's team: alerts are the booth team's.
select ok(not ('bea' = any(pg_temp.reaches(pg_temp.alert('a3000000-0000-0000-0000-0000000000a3', now())))),
  'the client''s devices never get the booth''s alerts');

-- Moving the event.
select throws_ok(
  $$update public.event set booth_id = 'c1000000-0000-0000-0000-0000000000c1'
    where id = 'e1000000-0000-0000-0000-0000000000e1'$$,
  '23503', null, 'an event with staff on call cannot move to another team''s booth');
select lives_ok(
  $$update public.event set booth_id = 'a3000000-0000-0000-0000-0000000000a3'
    where id = 'e1000000-0000-0000-0000-0000000000e1'$$,
  'it moves to another booth of the same team');
select is(
  (select booth_id from public.event_on_call where user_id = '22222222-0000-0000-0000-000000000002'),
  'a3000000-0000-0000-0000-0000000000a3'::uuid, 'and who is on call moves with it');
select is(pg_temp.reaches(pg_temp.alert('a3000000-0000-0000-0000-0000000000a3', now())),
  array['tom'], 'so the new booth''s alerts reach them');

-- Leaving.
delete from public.org_member where user_id = '22222222-0000-0000-0000-000000000002';
select is_empty($$select 1 from public.event_on_call where user_id = '22222222-0000-0000-0000-000000000002'$$,
  'leaving the team takes them off call');
insert into public.event_on_call (event_id, user_id) values
  ('e1000000-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001');
delete from public.event where id = 'e1000000-0000-0000-0000-0000000000e1';
select is_empty($$select 1 from public.event_on_call$$, 'cancelling the event takes everyone off call');

select * from finish();
rollback;

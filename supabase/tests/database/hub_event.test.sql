-- Events: platform admins book them; the client's team and the booth's team
-- read them; a booth is at one event at a time. The heartbeat learns the
-- current one, and a booth at an event that goes quiet is silent.
begin;
select plan(37);

insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'admin@example.com'),
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a@example.com'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'client-b@example.com'),
  ('c1c1c1c1-0000-0000-0000-000000000001', 'stranger-c@example.com'),
  ('b00b0000-0000-0000-0000-000000000001', 'booth-a@example.com');
insert into public.platform_admin (user_id) values ('ad000000-0000-0000-0000-000000000001');

-- A runs the booths (99Stud); B is a client; C has nothing to do with it.
insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Client B'),
  ('cccccccc-0000-0000-0000-00000000000c', 'Org C');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000c', 'c1c1c1c1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name, live_from, live_until) values
  ('a1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 1', null, null),
  ('a2000000-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 2', null, null),
  ('a3000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 3', null, null),
  ('a4000000-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 4', null, null),
  ('a5000000-0000-0000-0000-0000000000a5', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth 5',
    now() - interval '1 minute', now() + interval '1 hour');

-- Grants and functions, read from the catalog.
select ok(not has_column_privilege('authenticated', 'public.event', 'created_by', 'insert'),
  'staff never write who booked an event');
select ok(not has_column_privilege('authenticated', 'public.event', 'org_id', 'update'),
  'an event keeps its client');
select ok(not has_function_privilege('authenticated', 'public.booth_current_event(uuid)', 'execute'),
  'staff cannot call booth_current_event');
select ok(not has_function_privilege('anon', 'public.booth_current_event(uuid)', 'execute'),
  'anon cannot call booth_current_event');
select ok(has_function_privilege('service_role', 'public.booth_current_event(uuid)', 'execute'),
  'the service role can');
select ok(exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event'),
  'Realtime publishes events');

set local role authenticated;

-- The admin books.
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b',
      'a1000000-0000-0000-0000-0000000000a1', 'Halloween', now() - interval '1 hour', now() + interval '3 hours')$$,
  'an admin books a client''s event on a booth of another team');
select is(
  (select created_by from public.event where name = 'Halloween'),
  'ad000000-0000-0000-0000-000000000001'::uuid, 'the event says who booked it');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a1000000-0000-0000-0000-0000000000a1',
      'Clash', now() + interval '2 hours', now() + interval '4 hours')$$,
  '23P01', null, 'a booth is at one event at a time');
select lives_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b',
      'a1000000-0000-0000-0000-0000000000a1', 'After party', now() + interval '3 hours', now() + interval '5 hours')$$,
  'one event may start when the last ends');
select lives_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('aaaaaaaa-0000-0000-0000-00000000000a',
      'a2000000-0000-0000-0000-0000000000a2', 'Open day', now() - interval '1 hour', now() + interval '3 hours')$$,
  'another booth may be at an event at the same time');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-0000000000a2',
      'Backwards', now() + interval '9 hours', now() + interval '8 hours')$$,
  '23514', null, 'an event ends after it starts');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-0000000000a2',
      ' Padded ', now() + interval '9 hours', now() + interval '10 hours')$$,
  '23514', null, 'a name is stored trimmed, as the booth reads it');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at, created_by)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2000000-0000-0000-0000-0000000000a2',
      'Forged', now() + interval '9 hours', now() + interval '10 hours', 'a1a1a1a1-0000-0000-0000-000000000001')$$,
  '42501', null, 'nobody books in someone else''s name');

reset role;
update public.event set updated_at = now() - interval '1 day'
  where name = 'After party';
set local role authenticated;
update public.event set name = 'After-party'
  where name = 'After party';
select is(
  (select updated_at from public.event where name = 'After-party'),
  now(), 'a change moves updated_at');

-- The client's member.
select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_eq($$select name from public.event$$, array['Halloween', 'After-party'],
  'the client''s team reads its events, not the booth team''s own');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000a3',
      'Mine', now() + interval '9 hours', now() + interval '10 hours')$$,
  '42501', null, 'a client cannot book');
select is_empty(
  $$update public.event set name = 'Renamed' where name = 'Halloween' returning id$$,
  'a client cannot change an event');
select is_empty(
  $$delete from public.event where name = 'Halloween' returning id$$,
  'a client cannot cancel an event');

-- The booth team's member.
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_eq($$select name from public.event$$, array['Halloween', 'After-party', 'Open day'],
  'the booth''s team reads the events on its booths');
select throws_ok(
  $$insert into public.event (org_id, booth_id, name, starts_at, ends_at)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-0000000000a3',
      'Mine', now() + interval '9 hours', now() + interval '10 hours')$$,
  '42501', null, 'a member who isn''t an admin cannot book');

-- Someone else, and a booth.
select set_config('request.jwt.claims', '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty($$select 1 from public.event$$, 'another team reads no event');
select set_config('request.jwt.claims', '{"sub":"b00b0000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"booth_id":"a1000000-0000-0000-0000-0000000000a1"}}', true);
select is_empty($$select 1 from public.event$$, 'a booth reads no event');

-- The admin cancels.
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select isnt_empty(
  $$delete from public.event where name = 'Open day' returning id$$,
  'an admin cancels an event');

reset role;

-- The event a booth is at.
select is(
  (select array_agg(name) from public.booth_current_event('a1000000-0000-0000-0000-0000000000a1')),
  array['Halloween'], 'a booth is at the event that covers now, not the next one');
select is_empty(
  $$select 1 from public.booth_current_event('a3000000-0000-0000-0000-0000000000a3')$$,
  'a booth with no event is at none');
update public.event set starts_at = now() - interval '2 hours', ends_at = now()
  where name = 'Halloween';
select is_empty(
  $$select 1 from public.booth_current_event('a1000000-0000-0000-0000-0000000000a1')$$,
  'an event is over at its end');
update public.event set starts_at = now() - interval '1 hour', ends_at = now() + interval '3 hours'
  where name = 'Halloween';

-- Silence, from events. 3: at an event for an hour, never heard. 4: at an
-- event that started a minute ago. 5: event times from a minute ago, and an
-- event that started an hour ago.
insert into public.event (org_id, booth_id, name, starts_at, ends_at) values
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'a3000000-0000-0000-0000-0000000000a3', 'Gala', now() - interval '1 hour', now() + interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'a4000000-0000-0000-0000-0000000000a4', 'Late', now() - interval '1 minute', now() + interval '1 hour'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'a5000000-0000-0000-0000-0000000000a5', 'Both', now() - interval '1 hour', now() + interval '1 hour');
insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat) values
  ('a1000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', now() - interval '10 minutes', '{}');

select public.evaluate_silence();
select ok(exists (select 1 from public.alert where booth_id = 'a3000000-0000-0000-0000-0000000000a3' and key = 'booth.silent' and resolved_at is null),
  'a booth at an event, with no event times, never heard for an hour is silent');
select ok(not exists (select 1 from public.alert where booth_id = 'a4000000-0000-0000-0000-0000000000a4' and key = 'booth.silent'),
  'an event that started a minute ago is not silence yet');
select ok(exists (select 1 from public.alert where booth_id = 'a5000000-0000-0000-0000-0000000000a5' and key = 'booth.silent' and resolved_at is null),
  'with event times and an event, silence counts from the earliest start');
select ok(exists (select 1 from public.alert where booth_id = 'a1000000-0000-0000-0000-0000000000a1' and key = 'booth.silent' and resolved_at is null),
  'a booth last heard ten minutes into its event is silent');
select ok(not exists (select 1 from public.alert where booth_id = 'a2000000-0000-0000-0000-0000000000a2' and key = 'booth.silent'),
  'a booth whose event was cancelled is not silent');

update public.event set ends_at = now() - interval '1 second', starts_at = now() - interval '2 hours'
  where booth_id = 'a3000000-0000-0000-0000-0000000000a3';
select public.evaluate_silence();
select ok(not exists (select 1 from public.alert where booth_id = 'a3000000-0000-0000-0000-0000000000a3' and key = 'booth.silent' and resolved_at is null),
  'the silence closes when the event ends');
select ok(exists (select 1 from public.alert where booth_id = 'a1000000-0000-0000-0000-0000000000a1' and key = 'booth.silent' and resolved_at is null),
  'and another booth''s stays open');

-- What the booth's team keeps. Booths and teams with events stay.
select throws_ok(
  $$delete from public.booth where id = 'a1000000-0000-0000-0000-0000000000a1'$$,
  '23503', null, 'a booth with events cannot be deleted');
select throws_ok(
  $$delete from public.org where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$,
  '23503', null, 'a client with events cannot be deleted');
select is(
  (select count(*) from public.event where booth_id = 'a1000000-0000-0000-0000-0000000000a1'),
  2::bigint, 'the booth keeps both its events');

select * from finish();
rollback;

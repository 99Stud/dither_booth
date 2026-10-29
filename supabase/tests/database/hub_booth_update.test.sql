-- Staff ask their booths to update from Studio; the booth reads the request
-- in its heartbeat's answer and reports how it goes.
begin;
select plan(22);

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
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A'),
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Booth B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$insert into public.booth_update (booth_id, org_id, release)
    values ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', '0.8.0')
    returning state, requested_by$$,
  $$values ('requested', 'a1a1a1a1-0000-0000-0000-000000000001'::uuid)$$,
  'staff ask their booth to update, as themselves');
select throws_ok(
  $$insert into public.booth_update (booth_id, org_id, release)
    values ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', '0.8.0')$$,
  '42501', null, 'but not another org''s booth');
select throws_ok(
  $$insert into public.booth_update (booth_id, org_id, release)
    values ('b0b0b0b0-0000-0000-0000-0000000000b0', 'aaaaaaaa-0000-0000-0000-00000000000a', '0.8.0')$$,
  '23503', null, 'nor pass another org''s booth off as theirs');
select throws_ok(
  $$update public.booth_update set release = 'latest; reboot'
    where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0'$$,
  '23514', null, 'a release must be a version');
select throws_ok(
  $$update public.booth_update set state = 'done'
    where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0'$$,
  '42501', null, 'staff can''t say how it went: the booth does');
reset role;
-- Calling a refused function crashes the local Postgres: ask the catalog.
select ok(
  not has_function_privilege('authenticated', 'public.report_booth_update(uuid, jsonb)', 'execute'),
  'nor report for the booth');

select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.7.2"}'),
  '{"release": "0.8.0"}'::jsonb,
  'the heartbeat''s answer carries the request');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.7.2", "update": {"release": "0.8.0", "state": "waiting", "error": "The event runs until 23:00."}}'),
  '{"release": "0.8.0"}'::jsonb,
  'and keeps carrying it while the booth waits');
select results_eq(
  $$select state, error from public.booth_update where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0'$$,
  $$values ('waiting', 'The event runs until 23:00.')$$,
  'staff see why it waits');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.7.2", "update": {"release": "0.8.0", "state": "running", "error": null}}'),
  null, 'once it runs, the answer no longer asks');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.7.2", "update": {"release": "0.8.0", "state": "rolled-back", "error": "v0.8.0 did not start."}}'),
  null, 'a booth that went back is told nothing more');
select results_eq(
  $$select key, severity from public.alert
    where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0' and resolved_at is null$$,
  $$values ('booth.update-failed', 'warn')$$,
  'and staff get one alert for it');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.7.2", "update": {"release": "0.8.0", "state": "rolled-back", "error": "v0.8.0 did not start."}}'),
  null, 'reported again, the same news');
select is(
  (select count(*) from public.alert where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0'),
  1::bigint, 'is still one alert');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.8.0"}'),
  null, 'and a booth on the release is done');
select is(
  (select state from public.booth_update where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0'),
  'done', 'whatever it reported last');
select is(
  public.report_booth_update('a0a0a0a0-0000-0000-0000-0000000000a0',
    '{"release": "0.8.0", "update": {"release": "0.9.0", "state": "failed", "error": "x"}}'),
  null, 'a report about another release changes nothing');
select is(
  public.report_booth_update('b0b0b0b0-0000-0000-0000-0000000000b0', '{"release": "0.7.2"}'),
  null, 'a booth nobody asked gets nothing');

insert into public.booth_update (booth_id, org_id, release)
  values ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', '0.8.0');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$update public.booth_update set release = '0.8.0'
    where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0' returning state$$,
  array['requested'], 'asking again starts over');
select is(
  (select count(*) from public.alert
    where booth_id = 'a0a0a0a0-0000-0000-0000-0000000000a0' and resolved_at is null),
  0::bigint, 'and closes the failed-update alert');
select results_eq(
  $$delete from public.booth_update returning booth_id$$,
  array['a0a0a0a0-0000-0000-0000-0000000000a0'::uuid], 'staff cancel only their own requests');

reset role;
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'booth_update'),
  'requests are published to Realtime');

select * from finish();
rollback;

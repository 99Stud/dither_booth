-- When alerts open and close: evaluate_heartbeat for the printer's
-- conditions, evaluate_silence for a booth that stopped talking.
begin;
select plan(34);

-- A heartbeat as the protocol defines it, `p_age_s` seconds into its
-- conditions, sent now.
create function pg_temp.hb(
  p_conditions text[] default '{}',
  p_age_s int default 120,
  p_dry boolean default false
) returns jsonb language sql as $$
  select jsonb_build_object(
    'protocol', 0,
    'release', '0.7.0',
    'dryRun', p_dry,
    'sentAt', to_jsonb(now()),
    'printer', jsonb_build_object(
      'conditions', to_jsonb(p_conditions),
      'canPrint', true,
      'changedAt', to_jsonb(now() - make_interval(secs => p_age_s))
    ),
    'maintenance', jsonb_build_object('on', false, 'reasons', '[]'::jsonb)
  )
$$;

-- What a booth has open, as "key:severity", sorted.
create function pg_temp.open_alerts(p_booth uuid) returns text[] language sql as $$
  select coalesce(array_agg(key || ':' || severity order by key), '{}')
  from public.alert where booth_id = p_booth and resolved_at is null
$$;

insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A');
-- b1: no event window. b2, b3, b4: an event that is on right now.
insert into public.booth (id, org_id, name, live_from, live_until) values
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'No window', null, null),
  ('b2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'On, seen', now() - interval '1 hour', now() + interval '1 hour'),
  ('b3000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a', 'On, never seen', now() - interval '1 hour', now() + interval '1 hour'),
  ('b4000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a', 'On, dry run', now() - interval '1 hour', now() + interval '1 hour');

-- Heartbeats ---------------------------------------------------------------

select throws_ok(
  $$select public.evaluate_heartbeat('00000000-0000-0000-0000-000000000000', pg_temp.hb())$$,
  'P0002', null, 'a heartbeat from a booth the Hub does not know is refused');

select lives_ok(
  $$select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb())$$,
  'a ready heartbeat is accepted');
select is(
  (select heartbeat ->> 'release' from public.booth_status where booth_id = 'b1000000-0000-0000-0000-000000000001'),
  '0.7.0', 'and stored as the booth''s status');
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), '{}'::text[], 'a ready booth has no alert');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{paper-out}', 5));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.paper-out:critical'],
  'out of paper opens a critical alert at once');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{paper-out}', 5));
select is((select count(*) from public.alert where booth_id = 'b1000000-0000-0000-0000-000000000001'), 1::bigint,
  'the same heartbeat again opens nothing new');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb());
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), '{}'::text[], 'a ready heartbeat closes it');
select is((select count(*) from public.alert where booth_id = 'b1000000-0000-0000-0000-000000000001' and resolved_at is not null), 1::bigint,
  'and keeps it as history');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{paper-out}', 5));
select is((select count(*) from public.alert where booth_id = 'b1000000-0000-0000-0000-000000000001'), 2::bigint,
  'running out again opens a new alert');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb());

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{paper-near-end}', 5));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.paper-near-end:warn'],
  'paper running low is a warning');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb());

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{error}', 5));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.error:critical'], 'a printer error is critical');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb());

-- The minute of grace for a cover and a cable.
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{cover-open}', 20));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), '{}'::text[], 'a cover open for 20 s is not an alert yet');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{cover-open}', 70));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.cover-open:warn'], 'open for a minute, it warns');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{disconnected}', 20));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), '{}'::text[], 'an unplugged printer for 20 s is not an alert yet');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{disconnected}', 70));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.disconnected:critical'], 'unplugged for a minute, it is critical');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{unknown}', 600));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), '{}'::text[], 'a printer with no status yet never alerts');

select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{paper-out,cover-open}', 120));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'),
  array['printer.cover-open:warn', 'printer.paper-out:critical'], 'two conditions open two alerts');
select public.evaluate_heartbeat('b1000000-0000-0000-0000-000000000001', pg_temp.hb('{cover-open}', 120));
select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.cover-open:warn'],
  'and one clearing closes only its own');

select public.evaluate_heartbeat('b4000000-0000-0000-0000-000000000004', pg_temp.hb('{paper-out}', 600, true));
select is(pg_temp.open_alerts('b4000000-0000-0000-0000-000000000004'), '{}'::text[], 'a dry-run booth never alerts');

-- Silence -------------------------------------------------------------------

update public.booth_status set last_seen_at = now() - interval '10 minutes'
  where booth_id in ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000004');
insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat) values
  ('b2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', now() - interval '1 minute', pg_temp.hb());
select public.evaluate_silence();

select is(pg_temp.open_alerts('b1000000-0000-0000-0000-000000000001'), array['printer.cover-open:warn'],
  'a booth with no event window is never reported silent');
select is(pg_temp.open_alerts('b2000000-0000-0000-0000-000000000002'), '{}'::text[], 'a booth heard a minute ago is not silent');
select is(pg_temp.open_alerts('b3000000-0000-0000-0000-000000000003'), array['booth.silent:critical'],
  'a booth in its window that has never been heard is silent');
select is(pg_temp.open_alerts('b4000000-0000-0000-0000-000000000004'), '{}'::text[], 'a dry-run booth is never silent');

update public.booth_status set last_seen_at = now() - interval '4 minutes'
  where booth_id = 'b2000000-0000-0000-0000-000000000002';
select public.evaluate_silence();
select is(pg_temp.open_alerts('b2000000-0000-0000-0000-000000000002'), array['booth.silent:critical'],
  'four minutes of silence in the window opens booth.silent');
select public.evaluate_silence();
select is((select count(*) from public.alert where booth_id = 'b2000000-0000-0000-0000-000000000002'), 1::bigint,
  'and checking again opens nothing new');

select public.evaluate_heartbeat('b2000000-0000-0000-0000-000000000002', pg_temp.hb());
select is(pg_temp.open_alerts('b2000000-0000-0000-0000-000000000002'), '{}'::text[], 'the next heartbeat ends the silence');

update public.booth set live_until = now() - interval '1 minute' where id = 'b3000000-0000-0000-0000-000000000003';
select public.evaluate_silence();
select is(pg_temp.open_alerts('b3000000-0000-0000-0000-000000000003'), '{}'::text[], 'when the event is over its silence is closed');

-- Only the service role may call them. The grants are read from the catalog:
-- the local Postgres image segfaults when a role is refused a function, so
-- the refusal itself can't be provoked in a test.
select is(has_function_privilege('anon', 'public.evaluate_heartbeat(uuid, jsonb)', 'execute'), false, 'anon cannot apply a heartbeat');
select is(has_function_privilege('authenticated', 'public.evaluate_heartbeat(uuid, jsonb)', 'execute'), false, 'staff cannot apply a heartbeat');
select is(has_function_privilege('service_role', 'public.evaluate_heartbeat(uuid, jsonb)', 'execute'), true, 'the service role can');
select is(has_function_privilege('anon', 'public.evaluate_silence()', 'execute'), false, 'anon cannot run the silence check');
select is(has_function_privilege('authenticated', 'public.evaluate_silence()', 'execute'), false, 'staff cannot run the silence check');
select is(has_function_privilege('service_role', 'public.evaluate_silence()', 'execute'), true, 'the service role can');

select is(
  (select schedule from cron.job where jobname = 'booth-silence'),
  '* * * * *', 'the silence check runs every minute');

select * from finish();
rollback;

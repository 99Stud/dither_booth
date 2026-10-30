-- When alerts open and close: evaluate_heartbeat for the printer's
-- conditions and the lottery's stock, evaluate_silence for a booth that
-- stopped talking.
begin;
select plan(57);

-- Booth n of the test, as a uuid.
create function pg_temp.booth(p_n int) returns uuid language sql as $$
  select format('b%s000000-0000-0000-0000-00000000000%s', p_n, p_n)::uuid
$$;

-- A heartbeat as the protocol defines it: its printer has been in
-- `p_conditions` for `p_condition_age_s` seconds, and it was sent
-- `p_sent_offset_s` seconds from now. `p_lottery` ({live, stockLeft}) is
-- left out when null, as a booth from before it does.
create function pg_temp.heartbeat(
  p_conditions text[] default '{}',
  p_condition_age_s int default 120,
  p_dry_run boolean default false,
  p_sent_offset_s int default 0,
  p_lottery jsonb default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'protocol', 0,
    'release', '0.7.0',
    'dryRun', p_dry_run,
    'sentAt', to_jsonb(now() + make_interval(secs => p_sent_offset_s)),
    'printer', jsonb_build_object(
      'conditions', to_jsonb(p_conditions),
      'canPrint', true,
      'changedAt', to_jsonb(
        now() + make_interval(secs => p_sent_offset_s - p_condition_age_s)
      )
    ),
    'maintenance', jsonb_build_object('on', false, 'reasons', '[]'::jsonb)
  ) || case when p_lottery is null then '{}'::jsonb
            else jsonb_build_object('lottery', p_lottery) end
$$;

-- A heartbeat from a ready booth whose lottery is `p_live` with `p_stock_left`.
create function pg_temp.lottery_heartbeat(p_live boolean, p_stock_left int) returns jsonb language sql as $$
  select pg_temp.heartbeat(p_lottery => jsonb_build_object('live', p_live, 'stockLeft', p_stock_left))
$$;

create function pg_temp.send(p_n int, p_heartbeat jsonb) returns void language sql as $$
  select public.evaluate_heartbeat(pg_temp.booth(p_n), p_heartbeat)
$$;

-- What booth n has open, as "key:severity", sorted.
create function pg_temp.open_alerts(p_n int) returns text[] language sql as $$
  select coalesce(array_agg(key || ':' || severity order by key), '{}')
  from public.alert where booth_id = pg_temp.booth(p_n) and resolved_at is null
$$;

create function pg_temp.alert_count(p_n int) returns bigint language sql as $$
  select count(*) from public.alert where booth_id = pg_temp.booth(p_n)
$$;

insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A');
-- 1, 5, 6, 8, 9: no event window. 2, 3, 4, 7: an event that is on right now; 7's
-- window only opened a minute ago.
insert into public.booth (id, org_id, name, live_from, live_until)
select pg_temp.booth(n), 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth ' || n,
  case when n in (2, 3, 4) then now() - interval '1 hour'
       when n = 7 then now() - interval '1 minute' end,
  case when n in (2, 3, 4, 7) then now() + interval '1 hour' end
from generate_series(1, 9) as n;

-- Heartbeats ---------------------------------------------------------------

select throws_ok(
  $$select public.evaluate_heartbeat('00000000-0000-0000-0000-000000000000', pg_temp.heartbeat())$$,
  'P0002', null, 'a heartbeat from a booth the Hub does not know is refused');

select lives_ok($$select pg_temp.send(1, pg_temp.heartbeat())$$, 'a ready heartbeat is accepted');
select is(
  (select heartbeat ->> 'release' from public.booth_status where booth_id = pg_temp.booth(1)),
  '0.7.0', 'and stored as the booth''s status');
select is(pg_temp.open_alerts(1), '{}'::text[], 'a ready booth has no alert');

select pg_temp.send(1, pg_temp.heartbeat('{paper-out}', 5));
select is(pg_temp.open_alerts(1), array['printer.paper-out:critical'], 'out of paper opens a critical alert at once');
select pg_temp.send(1, pg_temp.heartbeat('{paper-out}', 5));
select is(pg_temp.alert_count(1), 1::bigint, 'the same heartbeat again opens nothing new');

select pg_temp.send(1, pg_temp.heartbeat());
select is(pg_temp.open_alerts(1), '{}'::text[], 'a ready heartbeat closes it');
select is(
  (select count(*) from public.alert where booth_id = pg_temp.booth(1) and resolved_at is not null),
  1::bigint, 'and keeps it as history');

select pg_temp.send(1, pg_temp.heartbeat('{paper-out}', 5));
select is(pg_temp.alert_count(1), 2::bigint, 'running out again opens a new alert');
select pg_temp.send(1, pg_temp.heartbeat());

select pg_temp.send(1, pg_temp.heartbeat('{paper-near-end}', 5));
select is(pg_temp.open_alerts(1), array['printer.paper-near-end:warn'], 'paper low is a warning');
select pg_temp.send(1, pg_temp.heartbeat());

select pg_temp.send(1, pg_temp.heartbeat('{error}', 5));
select is(pg_temp.open_alerts(1), array['printer.error:critical'], 'a printer error is critical');
select pg_temp.send(1, pg_temp.heartbeat());

-- The minute of grace for a cover and a cable.
select pg_temp.send(1, pg_temp.heartbeat('{cover-open}', 20));
select is(pg_temp.open_alerts(1), '{}'::text[], 'a cover open for 20 s is not an alert yet');
select pg_temp.send(1, pg_temp.heartbeat('{cover-open}', 70));
select is(pg_temp.open_alerts(1), array['printer.cover-open:warn'], 'open for a minute, it warns');
select pg_temp.send(1, pg_temp.heartbeat());

select pg_temp.send(1, pg_temp.heartbeat('{disconnected}', 20));
select is(pg_temp.open_alerts(1), '{}'::text[], 'a printer unplugged for 20 s is not an alert yet');
select pg_temp.send(1, pg_temp.heartbeat('{disconnected}', 70));
select is(pg_temp.open_alerts(1), array['printer.disconnected:critical'], 'unplugged for a minute, it is critical');
select pg_temp.send(1, pg_temp.heartbeat());

select pg_temp.send(1, pg_temp.heartbeat('{unknown}', 600));
select is(pg_temp.open_alerts(1), '{}'::text[], 'a printer with no status yet never alerts');

select pg_temp.send(1, pg_temp.heartbeat('{paper-out,cover-open}', 120));
select is(pg_temp.open_alerts(1),
  array['printer.cover-open:warn', 'printer.paper-out:critical'], 'two conditions open two alerts');
select pg_temp.send(1, pg_temp.heartbeat('{cover-open}', 120));
select is(pg_temp.open_alerts(1), array['printer.cover-open:warn'], 'and one clearing closes only its own');
select pg_temp.send(1, pg_temp.heartbeat());

-- An open alert under grace stays open when another condition changes (and
-- with it changedAt): no close-and-reopen, so no second push.
select pg_temp.send(5, pg_temp.heartbeat('{cover-open}', 120));
select pg_temp.send(5, pg_temp.heartbeat('{paper-out,cover-open}', 5));
select is(pg_temp.open_alerts(5),
  array['printer.cover-open:warn', 'printer.paper-out:critical'],
  'an open cover alert stays open when paper runs out next to it');
select pg_temp.send(5, pg_temp.heartbeat('{cover-open}', 5));
select is(pg_temp.open_alerts(5), array['printer.cover-open:warn'], 'and when the paper is back');
select is(
  (select count(*) from public.alert where booth_id = pg_temp.booth(5) and key = 'printer.cover-open'),
  1::bigint, 'it is the same alert all along');

-- Reconnecting (`unknown`) says nothing about the paper: alerts stay.
select pg_temp.send(5, pg_temp.heartbeat());
select pg_temp.send(5, pg_temp.heartbeat('{paper-out}', 120));
select pg_temp.send(5, pg_temp.heartbeat('{unknown}', 2));
select is(pg_temp.open_alerts(5), array['printer.paper-out:critical'], 'reconnecting keeps the paper alert open');
create temp table paper_out_before as
  select id from public.alert
  where booth_id = pg_temp.booth(5) and key = 'printer.paper-out' and resolved_at is null;
select pg_temp.send(5, pg_temp.heartbeat('{paper-out}', 2));
select is(
  (select id from public.alert
   where booth_id = pg_temp.booth(5) and key = 'printer.paper-out' and resolved_at is null),
  (select id from paper_out_before),
  'and it is the same alert once reconnected');

-- A booth clock that went back: the grace counts as passed.
select pg_temp.send(6, pg_temp.heartbeat('{cover-open}', -300));
select is(pg_temp.open_alerts(6), array['printer.cover-open:warn'], 'a condition that started "in the future" is not held back');

-- A late retry with an older heartbeat is ignored.
select pg_temp.send(6, pg_temp.heartbeat('{}', 120, false, -60));
select is(pg_temp.open_alerts(6), array['printer.cover-open:warn'], 'an older heartbeat closes nothing');
select is(
  (select (heartbeat #>> '{printer,conditions,0}') from public.booth_status where booth_id = pg_temp.booth(6)),
  'cover-open', 'and does not replace the stored status');

-- Dry run.
select pg_temp.send(4, pg_temp.heartbeat('{paper-out}', 600, true));
select is(pg_temp.open_alerts(4), '{}'::text[], 'a dry-run booth never alerts');
select is((select dry_run from public.booth_status where booth_id = pg_temp.booth(4)), true, 'and its status says so');
select pg_temp.send(6, pg_temp.heartbeat('{paper-out}', 600, true));
select is(pg_temp.open_alerts(6), '{}'::text[], 'switching to dry run closes what was open');

-- The lottery ------------------------------------------------------------

select pg_temp.send(8, pg_temp.heartbeat());
select is(pg_temp.open_alerts(8), '{}'::text[], 'a booth that sends no lottery state never alerts for it');
select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 12));
select is(pg_temp.open_alerts(8), '{}'::text[], 'a live lottery with prizes left is fine');

select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 0));
select is(pg_temp.open_alerts(8), array['lottery.out-of-stock:warn'], 'a live lottery with every prize out warns');
select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 0));
select is(pg_temp.alert_count(8), 1::bigint, 'the same heartbeat again opens nothing new');

select pg_temp.send(8, pg_temp.heartbeat('{unknown}', 2, p_lottery => '{"live": true, "stockLeft": 0}'));
select is(pg_temp.open_alerts(8), array['lottery.out-of-stock:warn'], 'a printer reconnecting does not hold it back');
select pg_temp.send(8, pg_temp.heartbeat('{paper-out}', 5, p_lottery => '{"live": true, "stockLeft": 0}'));
select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 0));
select is(pg_temp.open_alerts(8), array['lottery.out-of-stock:warn'], 'the paper coming back leaves it open');

select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 3));
select is(pg_temp.open_alerts(8), '{}'::text[], 'a restock closes it');

select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 0));
select pg_temp.send(8, pg_temp.lottery_heartbeat(false, 0));
select is(pg_temp.open_alerts(8), '{}'::text[], 'switching the lottery off closes it');
select is(
  (select count(*) from public.alert where booth_id = pg_temp.booth(8) and key = 'lottery.out-of-stock'),
  2::bigint, 'running out again had opened a new one');

select pg_temp.send(9, pg_temp.heartbeat(p_dry_run => true, p_lottery => '{"live": true, "stockLeft": 0}'));
select is(pg_temp.open_alerts(9), '{}'::text[], 'a dry-run booth never warns that its lottery is empty');
select pg_temp.send(8, pg_temp.lottery_heartbeat(true, 0));
select pg_temp.send(8, pg_temp.heartbeat(p_dry_run => true, p_lottery => '{"live": true, "stockLeft": 0}'));
select is(pg_temp.open_alerts(8), '{}'::text[], 'and switching to dry run closes it');

-- Silence -------------------------------------------------------------------

update public.booth_status set last_seen_at = now() - interval '10 minutes'
  where booth_id in (pg_temp.booth(1), pg_temp.booth(4));
insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat) values
  (pg_temp.booth(2), 'aaaaaaaa-0000-0000-0000-00000000000a', now() - interval '1 minute', pg_temp.heartbeat());
select public.evaluate_silence();

select is(pg_temp.open_alerts(1), '{}'::text[], 'a booth with no event window is never reported silent');
select is(pg_temp.open_alerts(2), '{}'::text[], 'a booth heard a minute ago is not silent');
select is(pg_temp.open_alerts(3), array['booth.silent:critical'], 'a booth never heard since its window opened an hour ago is silent');
select is(pg_temp.open_alerts(4), '{}'::text[], 'a dry-run booth is never silent');
select is(pg_temp.open_alerts(7), '{}'::text[], 'a window that opened a minute ago is not silence yet');

update public.booth_status set last_seen_at = now() - interval '4 minutes' where booth_id = pg_temp.booth(2);
select public.evaluate_silence();
select is(pg_temp.open_alerts(2), array['booth.silent:critical'], 'four minutes of silence in the window opens booth.silent');
select public.evaluate_silence();
select is(pg_temp.alert_count(2), 1::bigint, 'and checking again opens nothing new');

select pg_temp.send(2, pg_temp.heartbeat());
select is(pg_temp.open_alerts(2), '{}'::text[], 'the next heartbeat ends the silence');

update public.booth set live_until = now() - interval '1 minute' where id = pg_temp.booth(3);
select public.evaluate_silence();
select is(pg_temp.open_alerts(3), '{}'::text[], 'when the event is over its silence is closed');

select throws_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', pg_temp.booth(1), 'printer.on-fire', 'critical')$$,
  '23514', null, 'an alert key no rule opens is refused');

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

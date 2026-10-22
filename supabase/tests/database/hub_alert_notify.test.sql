-- Alert events go to the notify function through pg_net, after commit. The
-- queue is read here, so nothing leaves the database.
begin;
select plan(14);

insert into public.org (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A');
insert into public.booth (id, org_id, name) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A');

-- Events queued since the test began, oldest first.
create function pg_temp.queued() returns table (event text, alert uuid, secret text, url text)
language sql as $$
  select convert_from(body, 'utf8')::jsonb ->> 'event',
         (convert_from(body, 'utf8')::jsonb ->> 'alertId')::uuid,
         headers ->> 'x-notify-secret',
         url
  from net.http_request_queue order by id
$$;
delete from net.http_request_queue;

-- Without Vault secrets: the alert opens, nothing is queued.
insert into public.alert (id, org_id, booth_id, key, severity) values
  ('a1e47000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical');
select is((select count(*) from pg_temp.queued()), 0::bigint, 'without notify_url and notify_secret nothing is queued');
select isnt(
  (select last_notified_at from public.alert where id = 'a1e47000-0000-0000-0000-000000000001'),
  null, 'an alert counts as notified when it opens');

select vault.create_secret('https://hub.test/functions/v1/notify', 'notify_url');
select vault.create_secret('s3cret', 'notify_secret');

insert into public.alert (id, org_id, booth_id, key, severity) values
  ('a1e47000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.error', 'critical');
select results_eq(
  $$select event, alert, secret, url from pg_temp.queued()$$,
  $$values ('opened', 'a1e47000-0000-0000-0000-000000000002'::uuid, 's3cret', 'https://hub.test/functions/v1/notify')$$,
  'an alert that opens is queued for notify, with the shared secret');

delete from net.http_request_queue;
update public.alert set acked_at = now() where id = 'a1e47000-0000-0000-0000-000000000002';
select is((select count(*) from pg_temp.queued()), 0::bigint, 'an ack pushes nothing');

update public.alert set resolved_at = now() where id = 'a1e47000-0000-0000-0000-000000000002';
select results_eq(
  $$select event, alert from pg_temp.queued()$$,
  $$values ('resolved', 'a1e47000-0000-0000-0000-000000000002'::uuid)$$,
  'an alert that closes is queued once, as resolved');

delete from net.http_request_queue;
update public.alert set resolved_at = now() where id = 'a1e47000-0000-0000-0000-000000000002';
select is((select count(*) from pg_temp.queued()), 0::bigint, 'closing it again pushes nothing more');

-- Reminders.
delete from net.http_request_queue;
insert into public.alert (id, org_id, booth_id, key, severity, last_notified_at) values
  ('a1e47000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.disconnected', 'critical', null),
  ('a1e47000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-near-end', 'warn', null),
  ('a1e47000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.cover-open', 'warn', null);
update public.alert set last_notified_at = now() - interval '11 minutes'
  where id in ('a1e47000-0000-0000-0000-000000000001', 'a1e47000-0000-0000-0000-000000000003',
               'a1e47000-0000-0000-0000-000000000004');
update public.alert set acked_at = now() where id = 'a1e47000-0000-0000-0000-000000000001';
delete from net.http_request_queue;

select private.remind_open_alerts();
select results_eq(
  $$select event, alert from pg_temp.queued()$$,
  $$values ('reminder', 'a1e47000-0000-0000-0000-000000000003'::uuid)$$,
  'only an open, unacknowledged critical alert last pushed 10 minutes ago is reminded');
select ok(
  (select last_notified_at > now() - interval '1 second' from public.alert where id = 'a1e47000-0000-0000-0000-000000000003'),
  'and its clock starts again');

delete from net.http_request_queue;
select private.remind_open_alerts();
select is((select count(*) from pg_temp.queued()), 0::bigint, 'running again a minute later reminds nothing');

-- Nothing in private is callable from outside.
select is(has_schema_privilege('authenticated', 'private', 'usage'), false, 'staff cannot reach the private schema');
select is(has_schema_privilege('anon', 'private', 'usage'), false, 'nor can anon');
select is(has_function_privilege('authenticated', 'private.remind_open_alerts()', 'execute'), false, 'staff cannot trigger reminders');
select is(has_function_privilege('authenticated', 'private.post_alert_event(uuid, text)', 'execute'), false, 'nor post an alert event');

select is(
  (select schedule from cron.job where jobname = 'alert-reminders'),
  '* * * * *', 'reminders are checked every minute');

select * from finish();
rollback;

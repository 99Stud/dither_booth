-- Acking an alert, and the rule that a booth has one open alert per key.
begin;
select plan(13);

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
insert into public.alert (id, org_id, booth_id, key, severity) values
  ('a1e47000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
   'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical');

-- Staff A acks: the database records who.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$update public.alert set acked_at = '2026-10-31 18:05+00'
    where id = 'a1e47000-0000-0000-0000-000000000001' returning acked_by$$,
  array['a1a1a1a1-0000-0000-0000-000000000001'::uuid],
  'an ack records the member who made it');

-- ...and may write nothing else on the alert.
select throws_ok($$update public.alert set severity = 'warn'$$, '42501', null, 'staff cannot change the severity');
select throws_ok($$update public.alert set resolved_at = now()$$, '42501', null, 'staff cannot resolve an alert');
select throws_ok(
  $$update public.alert set acked_by = 'b1b1b1b1-0000-0000-0000-000000000001'$$,
  '42501', null, 'staff cannot name who acked');

-- Staff B can't touch org A's alert: the row is invisible to the update.
select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty(
  $$update public.alert set acked_at = null
    where id = 'a1e47000-0000-0000-0000-000000000001' returning id$$,
  'another org cannot un-ack the alert');

reset role;
select isnt(
  (select acked_at from public.alert where id = 'a1e47000-0000-0000-0000-000000000001'),
  null,
  'and it is still acked');

-- Un-acking clears who.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$update public.alert set acked_at = null where id = 'a1e47000-0000-0000-0000-000000000001'$$,
  'staff can un-ack');
select is(
  (select acked_by from public.alert where id = 'a1e47000-0000-0000-0000-000000000001'),
  null,
  'which clears who acked');

-- One open alert per booth and key (the service role's view of it).
reset role;
select throws_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical')$$,
  '23505', null, 'a second open alert with the same key is refused');
select lives_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-near-end', 'warn')$$,
  'a different key opens beside it');
select lives_ok(
  $$update public.alert set resolved_at = now() where id = 'a1e47000-0000-0000-0000-000000000001';
    insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical')$$,
  'once resolved, the same key can open again');
select throws_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.error', 'critical')$$,
  '23503', null, 'an alert cannot name a booth from another org');
select throws_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.error', 'info')$$,
  '23514', null, 'severity is warn or critical');

select * from finish();
rollback;

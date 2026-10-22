-- Who sees what: staff see their own org and nothing else, anon sees
-- nothing, and a booth's own JWT reads none of these tables (its heartbeat
-- goes through the Edge Function). Staff can't write what the Hub owns.
begin;
select plan(21);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a@example.com'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'staff-b@example.com'),
  ('b00b0000-0000-0000-0000-000000000001', 'booth-a@example.com');

insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Org B');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b1b1b1b1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A'),
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Booth B');
insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', now(), '{}'),
  ('b0b0b0b0-0000-0000-0000-0000000000b0', 'bbbbbbbb-0000-0000-0000-00000000000b', now(), '{}');
insert into public.alert (org_id, booth_id, key, severity) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'printer.paper-out', 'critical'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b0b0b0b0-0000-0000-0000-0000000000b0', 'printer.paper-out', 'critical');

-- anon holds no grant on any of them.
set local role anon;
select throws_ok($$select * from public.org$$, '42501', null, 'anon cannot read orgs');
select throws_ok($$select * from public.org_member$$, '42501', null, 'anon cannot read memberships');
select throws_ok($$select * from public.booth$$, '42501', null, 'anon cannot read booths');
select throws_ok($$select * from public.booth_status$$, '42501', null, 'anon cannot read booth status');
select throws_ok($$select * from public.alert$$, '42501', null, 'anon cannot read alerts');

-- Staff of org A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.org), 1::bigint, 'staff A sees one org');
select is((select name from public.org), 'Org A', 'and it is theirs');
select is((select count(*) from public.org_member), 1::bigint, 'staff A sees only their own membership');
select is((select count(*) from public.booth), 1::bigint, 'staff A sees only their booth');
select is((select count(*) from public.booth_status), 1::bigint, 'staff A sees only their booth status');
select is((select booth_id from public.alert), 'a0a0a0a0-0000-0000-0000-0000000000a0'::uuid, 'staff A sees only their alert');

select throws_ok(
  $$insert into public.booth (org_id, name) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'Mine now')$$,
  '42501', null, 'staff cannot add a booth to another org');
select throws_ok(
  $$update public.booth set registered_at = now()$$,
  '42501', null, 'staff cannot mark a booth registered');
select throws_ok(
  $$insert into public.alert (org_id, booth_id, key, severity)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a0a0a0a0-0000-0000-0000-0000000000a0', 'made.up', 'warn')$$,
  '42501', null, 'staff cannot open an alert');
select throws_ok(
  $$delete from public.alert$$,
  '42501', null, 'staff cannot delete an alert');
select throws_ok(
  $$insert into public.org_member (org_id, user_id)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a1a1a1a1-0000-0000-0000-000000000001')$$,
  '42501', null, 'staff cannot join another org');

-- Staff of org B see theirs.
select set_config('request.jwt.claims', '{"sub":"b1b1b1b1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select name from public.org), 'Org B', 'staff B sees only org B');

-- A booth's JWT: authenticated, booth_id in app_metadata, no membership.
select set_config('request.jwt.claims', '{"sub":"b00b0000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"booth_id":"a0a0a0a0-0000-0000-0000-0000000000a0"}}', true);
select is_empty($$select 1 from public.org$$, 'a booth reads no org');
select is_empty($$select 1 from public.booth$$, 'a booth reads no booth row');
select is_empty($$select 1 from public.booth_status$$, 'a booth reads no status');
select is_empty($$select 1 from public.alert$$, 'a booth reads no alert');

select * from finish();
rollback;

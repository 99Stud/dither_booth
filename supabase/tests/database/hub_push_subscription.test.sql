-- Devices that get a push: each member manages their own, in their own org.
begin;
select plan(13);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a1@example.com'),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'staff-a2@example.com');
insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Org B');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a2a2a2a2-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://fcm.googleapis.com/fcm/send/one', 'key', 'secret')
    returning endpoint$$,
  array['https://fcm.googleapis.com/fcm/send/one'],
  'a member registers their own device');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a2a2a2a2-0000-0000-0000-000000000002',
            'https://fcm.googleapis.com/fcm/send/other', 'key', 'secret')$$,
  '42501', null, 'but not a device for someone else');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://fcm.googleapis.com/fcm/send/org-b', 'key', 'secret')$$,
  '42501', null, 'nor one in an org they are not in');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://fcm.googleapis.com/fcm/send/one', 'key', 'secret')$$,
  '23505', null, 'an endpoint registers once');

select results_eq(
  $$update public.push_subscription set p256dh_key = 'new-key'
    where endpoint = 'https://fcm.googleapis.com/fcm/send/one' returning p256dh_key$$,
  array['new-key'],
  'a member refreshes their device keys');
select throws_ok(
  $$update public.push_subscription set user_id = 'a2a2a2a2-0000-0000-0000-000000000002'$$,
  '42501', null, 'but cannot hand the device to someone else');

-- A colleague in the same org doesn't see it, or remove it.
select set_config('request.jwt.claims', '{"sub":"a2a2a2a2-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is_empty($$select 1 from public.push_subscription$$, 'a colleague does not see the device');
select is_empty(
  $$delete from public.push_subscription returning id$$,
  'and cannot remove it');

select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$delete from public.push_subscription returning endpoint$$,
  array['https://fcm.googleapis.com/fcm/send/one'],
  'the owner removes it');

-- Only a push service's https endpoint is accepted: notify fetches it.
reset role;
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://169.254.169.254/latest/meta-data', 'key', 'secret')$$,
  '23514', null, 'an endpoint on another host is refused');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'http://fcm.googleapis.com/fcm/send/x', 'key', 'secret')$$,
  '23514', null, 'so is plain http');
select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://fcm.googleapis.com.evil.test/x', 'key', 'secret')$$,
  '23514', null, 'and a look-alike host');
select lives_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001',
            'https://wns2-by3p.notify.windows.com/w/?token=abc', 'key', 'secret')$$,
  'Windows push hosts are accepted');

select * from finish();
rollback;

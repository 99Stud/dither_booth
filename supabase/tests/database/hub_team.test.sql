-- Studio's Team: devices follow membership, and members stay written by the
-- team Edge Function alone.
begin;
select plan(5);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a1@example.com'),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'staff-a2@example.com');
insert into public.org (id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Org B');
insert into public.org_member (org_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a2a2a2a2-0000-0000-0000-000000000002', 'member'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2a2a2a2-0000-0000-0000-000000000002', 'member');
insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a2a2a2a2-0000-0000-0000-000000000002',
   'https://fcm.googleapis.com/fcm/send/a2-on-a', 'k', 'a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'a2a2a2a2-0000-0000-0000-000000000002',
   'https://fcm.googleapis.com/fcm/send/a2-on-b', 'k', 'a');

select throws_ok(
  $$insert into public.push_subscription (org_id, user_id, endpoint, p256dh_key, auth_secret)
    values ('bbbbbbbb-0000-0000-0000-00000000000b', 'a1a1a1a1-0000-0000-0000-000000000001',
      'https://fcm.googleapis.com/fcm/send/a1-on-b', 'k', 'a')$$,
  '23503', null, 'a device belongs to a member of its team');

delete from public.org_member
where org_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
  and user_id = 'a2a2a2a2-0000-0000-0000-000000000002';

select is_empty(
  $$select 1 from public.push_subscription where org_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  'removing a member removes their devices on that team');
select results_eq(
  $$select endpoint from public.push_subscription$$,
  array['https://fcm.googleapis.com/fcm/send/a2-on-b'],
  'and keeps their devices on their other teams');

-- Even an owner doesn't write memberships directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.org_member (org_id, user_id)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', 'a2a2a2a2-0000-0000-0000-000000000002')$$,
  '42501', null, 'an owner adds members only through Studio''s Team');
select throws_ok(
  $$delete from public.org_member where org_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$$,
  '42501', null, 'and removes them only there too');

select * from finish();
rollback;

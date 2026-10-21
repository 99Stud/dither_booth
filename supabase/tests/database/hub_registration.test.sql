-- One-time registration codes: what is stored, how long they last, and that
-- each works once.
begin;
select plan(16);

insert into auth.users (id, email) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'staff-a@example.com'),
  ('b00b0000-0000-0000-0000-000000000001', 'old-booth@example.com');
insert into public.org (id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'Org A');
insert into public.org_member (org_id, user_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a1a1a1a1-0000-0000-0000-000000000001');
insert into public.booth (id, org_id, name, auth_user_id) values
  ('a0a0a0a0-0000-0000-0000-0000000000a0', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Booth A',
   'b00b0000-0000-0000-0000-000000000001');

create temp table issued as
  select public.issue_booth_registration_code('a0a0a0a0-0000-0000-0000-0000000000a0') as code;
create function pg_temp.hash(p_code text) returns text language sql as $$
  select encode(extensions.digest(replace(p_code, '-', ''), 'sha256'), 'hex')
$$;

select matches((select code from issued), '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$',
  'a code is ten Crockford base32 characters, in two groups');
select is(
  (select registration_code_hash from public.booth where id = 'a0a0a0a0-0000-0000-0000-0000000000a0'),
  pg_temp.hash((select code from issued)),
  'only its sha256 is stored');
select ok(
  (select registration_expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
   from public.booth where id = 'a0a0a0a0-0000-0000-0000-0000000000a0'),
  'it lasts 24 hours');
select throws_ok(
  $$select public.issue_booth_registration_code('00000000-0000-0000-0000-000000000000')$$,
  'P0002', null, 'a code for a booth that does not exist is refused');

-- A new code replaces the old one.
create temp table reissued as
  select public.issue_booth_registration_code('a0a0a0a0-0000-0000-0000-0000000000a0') as code;
select is_empty(
  format($$select * from public.claim_booth_registration_code(%L)$$, pg_temp.hash((select code from issued))),
  'the earlier code no longer works once a new one is issued');

-- Claiming it.
select results_eq(
  format($$select booth_id, booth_name, previous_auth_user_id
           from public.claim_booth_registration_code(%L)$$, pg_temp.hash((select code from reissued))),
  $$values ('a0a0a0a0-0000-0000-0000-0000000000a0'::uuid, 'Booth A'::text, 'b00b0000-0000-0000-0000-000000000001'::uuid)$$,
  'the right code names its booth and the Auth user it had');
select is_empty(
  format($$select * from public.claim_booth_registration_code(%L)$$, pg_temp.hash((select code from reissued))),
  'and works only once');
select is(
  (select registration_code_hash from public.booth where id = 'a0a0a0a0-0000-0000-0000-0000000000a0'),
  null, 'nothing of it is left on the booth');

-- An expired code.
create temp table expired as
  select public.issue_booth_registration_code('a0a0a0a0-0000-0000-0000-0000000000a0') as code;
update public.booth set registration_expires_at = now() - interval '1 second'
  where id = 'a0a0a0a0-0000-0000-0000-0000000000a0';
select is_empty(
  format($$select * from public.claim_booth_registration_code(%L)$$, pg_temp.hash((select code from expired))),
  'an expired code does not work');

-- Staff see whether a booth is registered, never its code or Auth user.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select name, registered_at from public.booth$$, 'staff read a booth''s name and registration');
select throws_ok($$select registration_code_hash from public.booth$$, '42501', null, 'but not its code hash');
select throws_ok($$select auth_user_id from public.booth$$, '42501', null, 'nor its Auth user');
reset role;

-- Service role only. Read from the catalog: see hub_alert_rules.test.sql.
select is(has_function_privilege('authenticated', 'public.issue_booth_registration_code(uuid)', 'execute'), false, 'staff cannot issue a code through the API');
select is(has_function_privilege('anon', 'public.claim_booth_registration_code(text)', 'execute'), false, 'anon cannot claim one');
select is(has_function_privilege('service_role', 'public.issue_booth_registration_code(uuid)', 'execute'), true, 'the service role can issue');
select is(has_function_privilege('service_role', 'public.claim_booth_registration_code(text)', 'execute'), true, 'and claim');

select * from finish();
rollback;

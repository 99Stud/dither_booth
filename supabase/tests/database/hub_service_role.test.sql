-- The Edge Functions run as the service role: it must hold its own rights on
-- every Hub table, not rely on the stack's default privileges (the hosted
-- project grants nothing by default).
begin;
select plan(7);

select ok(
  has_table_privilege('service_role', format('public.%I', t), 'select, insert, update, delete'),
  format('the service role reads and writes %s', t))
from unnest(array['org', 'org_member', 'booth', 'booth_status', 'alert', 'push_subscription', 'booth_update']) as t;

select * from finish();
rollback;

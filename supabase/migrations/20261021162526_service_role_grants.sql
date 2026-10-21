-- The service role (the Edge Functions) runs evaluate_heartbeat,
-- evaluate_silence and the registration functions as itself, so it needs
-- rights on the tables they touch. The local stack grants them by default;
-- the hosted project doesn't grant new tables in public to anyone, so they
-- are written down here, like every other grant.
grant select, insert, update, delete on
  public.org,
  public.org_member,
  public.booth,
  public.booth_status,
  public.alert,
  public.push_subscription
to service_role;

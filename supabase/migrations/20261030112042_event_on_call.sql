-- On call: the staff picked for an event to get its booth's alerts while
-- it's on. They are members of the booth's team (the one that runs it), not
-- the client's. With nobody on call, or none of them with a device, the
-- whole team gets the alerts, as before.

create table public.event_on_call (
  event_id uuid not null,
  booth_id uuid not null,
  -- The booth's team: filled in from the event's booth.
  org_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- Moving the event to another booth moves its rows; to a booth of another
  -- team, the next key refuses it (23503) while anyone is on call.
  foreign key (event_id, booth_id)
    references public.event (id, booth_id) on update cascade on delete cascade,
  foreign key (booth_id, org_id)
    references public.booth (id, org_id) on delete cascade,
  -- Leaving the team takes them off call everywhere.
  foreign key (org_id, user_id)
    references public.org_member (org_id, user_id) on delete cascade
);

create index event_on_call_user_id_idx on public.event_on_call (user_id);
create index event_on_call_org_id_user_id_idx on public.event_on_call (org_id, user_id);
create index event_on_call_booth_id_org_id_idx on public.event_on_call (booth_id, org_id);

-- Callers name the event and the person; the booth and its team come from
-- the event. A row whose event doesn't exist keeps nulls, which the
-- not-null columns refuse.
create function public.event_on_call_fill()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select e.booth_id, b.org_id into new.booth_id, new.org_id
  from public.event e
  join public.booth b on b.id = e.booth_id
  where e.id = new.event_id;
  return new;
end;
$$;

revoke execute on function public.event_on_call_fill() from public, anon, authenticated;

create trigger event_on_call_fill
  before insert on public.event_on_call
  for each row execute function public.event_on_call_fill();

alter table public.event_on_call enable row level security;

-- The booth's team sees who is on call; admins put people on and off, as
-- they book the event.
create policy "teams read who is on call" on public.event_on_call
  for select to authenticated
  using (org_id in (select public.visible_org_ids()));

create policy "admins put staff on call" on public.event_on_call
  for insert to authenticated
  with check ((select public.is_platform_admin()));

create policy "admins take staff off call" on public.event_on_call
  for delete to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.event_on_call from anon, authenticated;
grant select, delete on public.event_on_call to authenticated;
grant insert (event_id, user_id) on public.event_on_call to authenticated;
grant select, insert, update, delete on public.event_on_call to service_role;

alter publication supabase_realtime add table public.event_on_call;

-- The devices an alert goes to. Its event is the one on the alert's booth
-- whose window covers when the alert opened, so a reminder after the event
-- ended still reaches that night's people. The devices are those of the
-- staff on call for it; with no such event, nobody on call, or no device
-- among them, every device of the booth's team. Read on every push, so
-- putting someone on call during the night reaches them from the next one.
create function public.alert_devices(p_alert_id uuid)
returns table (id uuid, endpoint text, p256dh_key text, auth_secret text)
language sql
stable
security invoker
set search_path = ''
as $$
  with alert as (
    select org_id, booth_id, opened_at from public.alert where id = p_alert_id
  ),
  on_call as (
    select d.id, d.endpoint, d.p256dh_key, d.auth_secret
    from alert a
    join public.event e
      on e.booth_id = a.booth_id
      and e.starts_at <= a.opened_at and a.opened_at < e.ends_at
    join public.event_on_call c on c.event_id = e.id
    join public.push_subscription d
      on d.org_id = c.org_id and d.user_id = c.user_id
  )
  select * from on_call
  union all
  select d.id, d.endpoint, d.p256dh_key, d.auth_secret
  from alert a
  join public.push_subscription d on d.org_id = a.org_id
  where not exists (select 1 from on_call)
$$;

revoke execute on function public.alert_devices(uuid) from public, anon, authenticated;
grant execute on function public.alert_devices(uuid) to service_role;

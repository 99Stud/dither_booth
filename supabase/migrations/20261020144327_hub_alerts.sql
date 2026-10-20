-- The Hub's baseline for operator alerts: who may see a booth, what it last
-- reported, the alerts opened from it, and the devices that get a push.
--
-- Every table carries org_id and RLS from day one, though only staff use it
-- for now. A booth never reads or writes these tables itself: the heartbeat
-- Edge Function checks its JWT and writes with the service role.

create table public.org (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.org_member (
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_member_user_id_idx on public.org_member (user_id);

create table public.booth (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- Silence only counts as an incident inside this window (the event plus a
  -- margin), set by staff. No window: never reported silent.
  live_from timestamptz,
  live_until timestamptz,
  created_at timestamptz not null default now(),
  check (live_from is null or live_until is null or live_until > live_from),
  -- The target of the composite foreign keys below, so a row can't name a
  -- booth from another org.
  unique (id, org_id)
);

create index booth_org_id_idx on public.booth (org_id);

-- The last heartbeat of each booth, as the protocol package defines it.
create table public.booth_status (
  booth_id uuid primary key,
  org_id uuid not null,
  last_seen_at timestamptz not null,
  heartbeat jsonb not null,
  foreign key (booth_id, org_id)
    references public.booth (id, org_id) on delete cascade
);

create index booth_status_org_id_idx on public.booth_status (org_id);

create table public.alert (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  booth_id uuid not null,
  key text not null check (length(trim(key)) > 0),
  severity text not null check (severity in ('warn', 'critical')),
  opened_at timestamptz not null default now(),
  last_notified_at timestamptz,
  acked_at timestamptz,
  acked_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  foreign key (booth_id, org_id)
    references public.booth (id, org_id) on delete cascade
);

-- One open alert per booth and key: a repeated heartbeat can't open another.
create unique index alert_one_open_per_key
  on public.alert (booth_id, key) where resolved_at is null;
create index alert_booth_id_idx on public.alert (booth_id);
create index alert_org_opened_at_idx on public.alert (org_id, opened_at desc);

-- A staff device that gets web push (one row per browser subscription).
create table public.push_subscription (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_secret text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

create index push_subscription_org_id_idx on public.push_subscription (org_id);
create index push_subscription_user_id_idx on public.push_subscription (user_id);

-- Whoever acks an alert is recorded by the database, not claimed by the
-- client: staff may only write acked_at (see the grants), this sets the rest.
create function public.alert_set_acked_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.acked_at is distinct from old.acked_at then
    new.acked_by := case
      when new.acked_at is null then null
      else (select auth.uid())
    end;
  end if;
  return new;
end;
$$;

revoke execute on function public.alert_set_acked_by() from public, anon, authenticated;

create trigger alert_set_acked_by
  before update on public.alert
  for each row execute function public.alert_set_acked_by();

-- Row level security -------------------------------------------------------

alter table public.org enable row level security;
alter table public.org_member enable row level security;
alter table public.booth enable row level security;
alter table public.booth_status enable row level security;
alter table public.alert enable row level security;
alter table public.push_subscription enable row level security;

-- A member sees their own membership; every other table follows it. The
-- subquery runs under org_member's own policy, so it only ever sees the
-- caller's rows.
create policy "members read their own membership" on public.org_member
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members read their orgs" on public.org
  for select to authenticated
  using (id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members read their booths" on public.booth
  for select to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members read their booths' status" on public.booth_status
  for select to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members read their alerts" on public.alert
  for select to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members ack their alerts" on public.alert
  for update to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())))
  with check (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members read their own devices" on public.push_subscription
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "members add their own devices" on public.push_subscription
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and org_id in (select org_id from public.org_member where user_id = (select auth.uid()))
  );

create policy "members refresh their own devices" on public.push_subscription
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "members remove their own devices" on public.push_subscription
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Grants -------------------------------------------------------------------
-- Nothing for anon. Staff read; they write only an alert's acked_at and their
-- own devices' keys. The service role (the Edge Functions) keeps its own.

revoke all on public.org, public.org_member, public.booth, public.booth_status,
  public.alert, public.push_subscription from anon, authenticated;

grant select on public.org, public.org_member, public.booth,
  public.booth_status, public.alert to authenticated;
grant update (acked_at) on public.alert to authenticated;

grant select, insert, delete on public.push_subscription to authenticated;
grant update (p256dh_key, auth_secret, user_agent)
  on public.push_subscription to authenticated;

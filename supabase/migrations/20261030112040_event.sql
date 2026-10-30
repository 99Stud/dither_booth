-- Events: one client, one booth, one window, a name. Platform admins book
-- them in Studio, ahead of the night; the booth hears about its current one
-- in its heartbeat's answer. The booth keeps its own start and end for its
-- stats (decision 0005, amended by 0012): this window is the booking.
--
-- org_id is the client's team, which may not be the booth's: 99Stud's booth
-- at a client's party. Both teams see the event.

create extension if not exists btree_gist with schema extensions;

create table public.event (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org (id) on delete restrict,
  booth_id uuid not null references public.booth (id) on delete restrict,
  -- Trimmed, as the heartbeat's answer reads it: the booth gets it as is.
  name text not null check (name = trim(name) and length(name) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- A booth is at one event at a time. Back to back is fine: the window is
  -- half-open, so one ending at 20:00 and the next starting then don't meet.
  constraint event_one_at_a_time exclude using gist (
    booth_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ),
  -- Targets for the composite keys that tie rows to an event and its booth
  -- (event_on_call; visits later).
  unique (id, org_id),
  unique (id, booth_id)
);

create index event_org_id_starts_at_idx on public.event (org_id, starts_at desc);
create index event_created_by_idx on public.event (created_by);

-- Whoever books it, from their session: the column isn't granted.
create function public.event_set_created_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  return new;
end;
$$;

create function public.event_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.event_set_created_by() from public, anon, authenticated;
revoke execute on function public.event_touch_updated_at() from public, anon, authenticated;

create trigger event_set_created_by
  before insert on public.event
  for each row execute function public.event_set_created_by();

create trigger event_touch_updated_at
  before update on public.event
  for each row execute function public.event_touch_updated_at();

alter table public.event enable row level security;

-- The client's team, and the team that runs the booth (its staff go there
-- and may be on call). The booth subquery runs under booth's own policy.
create policy "teams read their events" on public.event
  for select to authenticated
  using (
    org_id in (select public.visible_org_ids())
    or booth_id in (
      select id from public.booth where org_id in (select public.visible_org_ids())
    )
  );

create policy "admins book events" on public.event
  for insert to authenticated
  with check ((select public.is_platform_admin()));

create policy "admins change events" on public.event
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create policy "admins cancel events" on public.event
  for delete to authenticated
  using ((select public.is_platform_admin()));

revoke all on public.event from anon, authenticated;
grant select, delete on public.event to authenticated;
grant insert (org_id, booth_id, name, starts_at, ends_at) on public.event to authenticated;
-- The client stays: an event booked for the wrong client is cancelled and
-- booked again.
grant update (booth_id, name, starts_at, ends_at) on public.event to authenticated;
grant select, insert, update, delete on public.event to service_role;

alter publication supabase_realtime add table public.event;

-- The event a booth is at right now, or nothing. For the heartbeat
-- function, which tells the booth in its answer.
create function public.booth_current_event(p_booth_id uuid)
returns table (id uuid, name text, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.name, e.starts_at, e.ends_at
  from public.event e
  where e.booth_id = p_booth_id
    and e.starts_at <= now() and now() < e.ends_at
$$;

revoke execute on function public.booth_current_event(uuid) from public, anon, authenticated;
grant execute on function public.booth_current_event(uuid) to service_role;

-- A booth is live during its event times (live_from to live_until) or one
-- of its events, and silent once it has sent nothing for three minutes,
-- counted from the earliest start among them. The rest is as before.
create or replace function public.evaluate_silence()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_silent constant interval := interval '3 minutes';
begin
  with windows (booth_id, since) as (
    select id, live_from from public.booth
    where live_from <= now() and now() <= live_until
    union all
    select booth_id, starts_at from public.event
    where starts_at <= now() and now() < ends_at
  ),
  live as (
    select booth_id, min(since) as since from windows group by booth_id
  ),
  ended as (
    update public.alert set resolved_at = now()
    where key = 'booth.silent'
      and resolved_at is null
      and booth_id not in (select booth_id from live)
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select b.org_id, b.id, 'booth.silent', 'critical'
  from public.booth b
  join live on live.booth_id = b.id
  left join public.booth_status s on s.booth_id = b.id
  where greatest(s.last_seen_at, live.since) < now() - v_silent
    and coalesce(s.dry_run, false) is false
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

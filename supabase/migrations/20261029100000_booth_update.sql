-- Staff ask a booth to update to a release from Studio. The Hub only holds
-- the request: the booth reads it in its heartbeat's answer, decides when
-- (never during its event, nor right after a visit), runs it, and reports
-- how it goes in its next heartbeats. One request per booth: asking again
-- replaces it.

alter table public.alert drop constraint alert_key_known;
alter table public.alert
  add constraint alert_key_known check (key in (
    'printer.paper-out',
    'printer.error',
    'printer.disconnected',
    'printer.paper-near-end',
    'printer.cover-open',
    'booth.silent',
    'booth.update-failed'
  ));

create table public.booth_update (
  booth_id uuid primary key,
  org_id uuid not null,
  -- A release as tags name it, without the v: 0.8.0, 0.8.0-rc.1.
  release text not null
    check (release ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  -- requested: the booth hasn't answered yet. waiting: it got the request
  -- and waits for a quiet moment. Then the booth's job's own states.
  state text not null default 'requested'
    check (state in ('requested', 'waiting', 'running', 'done', 'failed', 'rolled-back')),
  state_at timestamptz not null default now(),
  -- Why it waits, or why it failed, as the booth says it.
  error text check (char_length(error) <= 500),
  foreign key (booth_id, org_id)
    references public.booth (id, org_id) on delete cascade
);

create index booth_update_org_id_idx on public.booth_update (org_id);
create index booth_update_requested_by_idx on public.booth_update (requested_by);

alter table public.booth_update enable row level security;

create policy "members read their booths' updates" on public.booth_update
  for select to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members ask their booths to update" on public.booth_update
  for insert to authenticated
  with check (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members ask again" on public.booth_update
  for update to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())))
  with check (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

create policy "members cancel" on public.booth_update
  for delete to authenticated
  using (org_id in (select org_id from public.org_member where user_id = (select auth.uid())));

-- A request (an insert, or an update that names the release) starts over:
-- whoever asked, now, and nothing heard from the booth yet. The booth's
-- reports only change state, state_at and error.
--
-- It also closes the booth's last Update failed alert, which staff may not
-- resolve themselves: hence security definer, in private (out of the API's
-- reach, as alert_stamp_notified). The row it runs for has passed the
-- booth_update policies; one that fails their check rolls the close back.
create function private.booth_update_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.requested_by := (select auth.uid());
  new.requested_at := now();
  new.state := 'requested';
  new.state_at := now();
  new.error := null;
  -- A new request ends the news of the last one.
  update public.alert set resolved_at = now()
  where booth_id = new.booth_id and key = 'booth.update-failed' and resolved_at is null;
  return new;
end;
$$;

create trigger booth_update_requested
  before insert or update of release on public.booth_update
  for each row execute function private.booth_update_requested();

-- A trigger fires without EXECUTE; nobody calls it by hand.
revoke execute on function private.booth_update_requested()
  from public, anon, authenticated;

-- Staff name the booth and the release; the Hub fills in the rest.
revoke all on public.booth_update from anon, authenticated;
grant select, delete on public.booth_update to authenticated;
grant insert (booth_id, org_id, release) on public.booth_update to authenticated;
grant update (release) on public.booth_update to authenticated;
grant select, insert, update, delete on public.booth_update to service_role;

-- Called by the heartbeat function after evaluate_heartbeat. Records what
-- the booth says about the request, and returns the release it should
-- install ({"release": "0.8.0"}), or null when nothing waits for it.
create function public.report_booth_update(p_booth_id uuid, p_heartbeat jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.booth_update;
  v_report jsonb := p_heartbeat -> 'update';
begin
  select * into v_request from public.booth_update
  where booth_id = p_booth_id
  for update;

  if not found then
    return null;
  end if;

  if p_heartbeat ->> 'release' = v_request.release then
    -- The booth runs it: done, whoever installed it.
    update public.booth_update
    set state = 'done', state_at = now(), error = null
    where booth_id = p_booth_id and state <> 'done';
    update public.alert set resolved_at = now()
    where booth_id = p_booth_id and key = 'booth.update-failed' and resolved_at is null;
    return null;
  end if;

  if v_report ->> 'release' = v_request.release
    and (v_report ->> 'state', v_report ->> 'error')
      is distinct from (v_request.state, v_request.error)
  then
    update public.booth_update
    set state = v_report ->> 'state',
        state_at = now(),
        error = left(v_report ->> 'error', 500)
    where booth_id = p_booth_id
    returning * into v_request;

    -- An update that stopped or went back is news staff asked for: one
    -- alert, pushed like the printer's. Asking again closes it (below).
    if v_request.state in ('failed', 'rolled-back') then
      insert into public.alert (org_id, booth_id, key, severity)
      values (v_request.org_id, p_booth_id, 'booth.update-failed', 'warn')
      on conflict (booth_id, key) where resolved_at is null do nothing;
    end if;
  end if;

  if v_request.state in ('requested', 'waiting') then
    return jsonb_build_object('release', v_request.release);
  end if;

  return null;
end;
$$;

revoke execute on function public.report_booth_update(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.report_booth_update(uuid, jsonb) to service_role;

alter publication supabase_realtime add table public.booth_update;

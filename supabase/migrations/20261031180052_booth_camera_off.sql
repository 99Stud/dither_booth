-- The booth has no camera: its iPad is gone (no kiosk page has reported
-- for 90 s: off, asleep, out of Wi-Fi, the Shutter closed) or a page's
-- camera failed, so no guest can start a visit. Critical, like a silence: the booth is of no use
-- until someone goes to it. The heartbeat carries the camera's state
-- (`camera`: on, changedAt). A heartbeat without it (a booth from before
-- it) says nothing about the camera: it neither opens this alert nor closes
-- one that is open.

alter table public.alert drop constraint alert_key_known;
alter table public.alert
  add constraint alert_key_known check (key in (
    'printer.paper-out',
    'printer.error',
    'printer.disconnected',
    'printer.paper-near-end',
    'printer.cover-open',
    'booth.silent',
    'booth.update-failed',
    'booth.camera-off',
    'lottery.out-of-stock'
  ));

-- As in 20261030115957_lottery_out_of_stock, plus the camera's rule:
--
-- - It only opens while the booth is live (between its event times or
--   during one of its events), like a silence: an iPad off between events
--   is normal. Being live is read when the heartbeat comes in.
-- - It only opens once the camera has been off for two minutes, counted on
--   the booth's own clock (`changedAt` to `sentAt`) like the printer's
--   minute: a kiosk reload, the camera's three restarts and an iPad reboot
--   all fit. A negative age counts as past it. Once open, it stays open
--   while the camera is off, whatever else changes.
-- - It is counted from `changedAt` even when that is before the window: a
--   booth entering its event times with its iPad off alerts on its first
--   heartbeat in, since staff expect it up by then.
-- - The iPad back with its camera closes it, and so does the booth going
--   out of its windows (here on the next heartbeat; evaluate_silence does
--   it for a booth that went quiet too). `create or replace` keeps the function's grants.
create or replace function public.evaluate_heartbeat(p_booth_id uuid, p_heartbeat jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_stored integer;
  v_conditions jsonb := coalesce(p_heartbeat #> '{printer,conditions}', '[]'::jsonb);
  v_condition_age interval :=
    (p_heartbeat ->> 'sentAt')::timestamptz
    - (p_heartbeat #>> '{printer,changedAt}')::timestamptz;
  v_past_grace boolean;
  v_unknown boolean := v_conditions @> '["unknown"]';
  v_lottery_known boolean := p_heartbeat ? 'lottery';
  v_lottery_empty boolean := coalesce(
    (p_heartbeat #>> '{lottery,live}')::boolean
      and (p_heartbeat #>> '{lottery,stockLeft}')::integer = 0,
    false);
  v_camera_known boolean := p_heartbeat ? 'camera';
  v_camera_off boolean := coalesce(
    not (p_heartbeat #>> '{camera,on}')::boolean, false);
  v_camera_age interval :=
    (p_heartbeat ->> 'sentAt')::timestamptz
    - (p_heartbeat #>> '{camera,changedAt}')::timestamptz;
  v_camera_grace constant interval := interval '2 minutes';
  v_camera_past_grace boolean;
  v_live boolean;
  v_open text[];
begin
  select org_id into v_org_id from public.booth where id = p_booth_id;
  if not found then
    raise exception 'unknown booth %', p_booth_id using errcode = 'P0002';
  end if;

  insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat)
  values (p_booth_id, v_org_id, now(), p_heartbeat)
  on conflict (booth_id) do update
    set last_seen_at = excluded.last_seen_at, heartbeat = excluded.heartbeat
    where (public.booth_status.heartbeat ->> 'sentAt')::timestamptz
      <= (excluded.heartbeat ->> 'sentAt')::timestamptz;
  get diagnostics v_stored = row_count;
  if v_stored = 0 then
    return;
  end if;

  if coalesce((p_heartbeat ->> 'dryRun')::boolean, false) then
    update public.alert set resolved_at = now()
    where booth_id = p_booth_id and resolved_at is null;
    return;
  end if;

  v_past_grace := v_condition_age >= interval '60 seconds'
    or v_condition_age < interval '0';
  v_camera_past_grace := v_camera_age >= v_camera_grace
    or v_camera_age < interval '0';
  v_live := exists (
    select 1 from public.booth
    where id = p_booth_id and live_from <= now() and now() <= live_until
  ) or exists (
    select 1 from public.event
    where booth_id = p_booth_id and starts_at <= now() and now() < ends_at
  );
  v_open := array(
    select key from public.alert
    where booth_id = p_booth_id and resolved_at is null
  );

  with wanted (key, severity) as (
    select key, severity
    from (values
      ('printer.paper-out', 'critical', v_conditions @> '["paper-out"]'),
      ('printer.error', 'critical', v_conditions @> '["error"]'),
      ('printer.disconnected', 'critical',
        v_conditions @> '["disconnected"]'
        and (v_past_grace or 'printer.disconnected' = any(v_open))),
      ('printer.paper-near-end', 'warn', v_conditions @> '["paper-near-end"]'),
      ('printer.cover-open', 'warn',
        v_conditions @> '["cover-open"]'
        and (v_past_grace or 'printer.cover-open' = any(v_open)))
    ) as t (key, severity, active)
    where active and not v_unknown
    union all
    select 'lottery.out-of-stock', 'warn' where v_lottery_empty
    union all
    select 'booth.camera-off', 'critical'
    where v_camera_off and v_live
      and (v_camera_past_grace or 'booth.camera-off' = any(v_open))
  ),
  closed as (
    -- A heartbeat is proof of life, so it also ends a silence.
    update public.alert a set resolved_at = now()
    where a.booth_id = p_booth_id
      and a.resolved_at is null
      and (
        a.key = 'booth.silent'
        or (
          not v_unknown
          and a.key like 'printer.%'
          and a.key not in (select key from wanted)
        )
        or (
          v_lottery_known
          and a.key = 'lottery.out-of-stock'
          and not v_lottery_empty
        )
        or (
          a.key = 'booth.camera-off'
          and (not v_live or (v_camera_known and not v_camera_off))
        )
      )
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select v_org_id, p_booth_id, key, severity from wanted
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

-- As in 20261030112040_event, and a booth out of its windows also has its
-- Camera off closed: a booth that went quiet with its iPad off would
-- otherwise keep it open until it reports again.
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
    where key in ('booth.silent', 'booth.camera-off')
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

-- When a booth's alerts open and close. Two functions, both for the service
-- role only (the heartbeat Edge Function and pg_cron): they run as the
-- caller, so they need no security definer and no one else can call them.

-- The alerts the rules can open. A new rule adds its key here, so a typo in
-- a rule fails instead of opening an alert nobody recognises.
alter table public.alert
  add constraint alert_key_known check (key in (
    'printer.paper-out',
    'printer.error',
    'printer.disconnected',
    'printer.paper-near-end',
    'printer.cover-open',
    'booth.silent'
  ));

-- Whether the booth said it runs in dry run (development), read once.
alter table public.booth_status
  add column dry_run boolean
  generated always as (coalesce((heartbeat ->> 'dryRun')::boolean, false)) stored;

-- Applies one heartbeat: stores it as the booth's status, opens an alert for
-- each condition that now holds, and closes the ones that no longer do.
--
-- - A cover that is open or a printer that is unplugged only opens an alert
--   after a minute (it is how paper is changed). The minute is counted on the
--   booth's own clock, from `changedAt` to `sentAt`, so a Pi with the wrong
--   time doesn't skew it. Once open, the alert stays open while the
--   condition holds, whatever else changes. A negative age (the booth's clock
--   went back) counts as past the minute: better a warning early than none.
-- - `unknown` (reconnecting) says nothing about the paper or the cover, so
--   it leaves printer alerts as they are.
-- - A dry-run booth never alerts: switching to dry run closes what is open.
-- - A heartbeat older than the stored one (a late retry) is ignored.
-- - Raises P0002 (no_data_found) for a booth the Hub doesn't have; the Edge
--   Function answers 404 for it.
create function public.evaluate_heartbeat(p_booth_id uuid, p_heartbeat jsonb)
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
      )
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select v_org_id, p_booth_id, key, severity from wanted
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

-- Opens `booth.silent` for a booth whose event is on (between live_from and
-- live_until) and that has sent nothing for three minutes, counting from the
-- start of the window, and closes it once the window is over. A booth
-- outside its window, or in dry run, is never silent.
create function public.evaluate_silence()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_silent constant interval := interval '3 minutes';
begin
  with live as (
    select id from public.booth
    where live_from <= now() and now() <= live_until
  ),
  ended as (
    update public.alert set resolved_at = now()
    where key = 'booth.silent'
      and resolved_at is null
      and booth_id not in (select id from live)
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select b.org_id, b.id, 'booth.silent', 'critical'
  from public.booth b
  join live on live.id = b.id
  left join public.booth_status s on s.booth_id = b.id
  where greatest(s.last_seen_at, b.live_from) < now() - v_silent
    and coalesce(s.dry_run, false) is false
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

revoke execute on function public.evaluate_heartbeat(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.evaluate_silence()
  from public, anon, authenticated;
grant execute on function public.evaluate_heartbeat(uuid, jsonb) to service_role;
grant execute on function public.evaluate_silence() to service_role;

create extension if not exists pg_cron;

select cron.schedule(
  'booth-silence',
  '* * * * *',
  'select public.evaluate_silence()'
);

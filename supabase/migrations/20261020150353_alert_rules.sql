-- When a booth's alerts open and close. Two functions, both for the service
-- role only (the heartbeat Edge Function and pg_cron): they run as the
-- caller, so they need no security definer and no one else can call them.

-- Applies one heartbeat: stores it as the booth's status, opens an alert for
-- each condition that now holds, and closes the ones that no longer do.
--
-- A cover that is open or a printer that is unplugged only counts after a
-- minute (it is how paper is changed). The minute is counted on the booth's
-- own clock, between `changedAt` and `sentAt`, so a Pi with the wrong time
-- doesn't skew it. A dry-run booth never alerts.
create function public.evaluate_heartbeat(p_booth_id uuid, p_heartbeat jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_conditions jsonb := coalesce(p_heartbeat #> '{printer,conditions}', '[]'::jsonb);
  v_age interval :=
    (p_heartbeat ->> 'sentAt')::timestamptz
    - (p_heartbeat #>> '{printer,changedAt}')::timestamptz;
  v_grace constant interval := interval '60 seconds';
begin
  select org_id into v_org_id from public.booth where id = p_booth_id;
  if not found then
    raise exception 'unknown booth %', p_booth_id using errcode = 'P0002';
  end if;

  insert into public.booth_status (booth_id, org_id, last_seen_at, heartbeat)
  values (p_booth_id, v_org_id, now(), p_heartbeat)
  on conflict (booth_id) do update
    set last_seen_at = excluded.last_seen_at, heartbeat = excluded.heartbeat;

  if coalesce((p_heartbeat ->> 'dryRun')::boolean, false) then
    return;
  end if;

  with wanted (key, severity) as (
    select key, severity
    from (values
      ('printer.paper-out', 'critical', v_conditions @> '["paper-out"]'),
      ('printer.error', 'critical', v_conditions @> '["error"]'),
      ('printer.disconnected', 'critical',
        v_conditions @> '["disconnected"]' and v_age >= v_grace),
      ('printer.paper-near-end', 'warn', v_conditions @> '["paper-near-end"]'),
      ('printer.cover-open', 'warn',
        v_conditions @> '["cover-open"]' and v_age >= v_grace)
    ) as t (key, severity, active)
    where active
  ),
  closed as (
    -- A heartbeat is proof of life, so it also ends a silence.
    update public.alert a set resolved_at = now()
    where a.booth_id = p_booth_id
      and a.resolved_at is null
      and (
        a.key = 'booth.silent'
        or (a.key like 'printer.%' and a.key not in (select key from wanted))
      )
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select v_org_id, p_booth_id, key, severity from wanted
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

-- Opens `booth.silent` for a booth whose event is on (inside live_from and
-- live_until) and which has sent nothing for three minutes, and closes it
-- once the window is over. A booth outside its window is never silent.
create function public.evaluate_silence()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_silent constant interval := interval '3 minutes';
begin
  update public.alert a set resolved_at = now()
  from public.booth b
  where a.booth_id = b.id
    and a.key = 'booth.silent'
    and a.resolved_at is null
    and (b.live_from <= now() and now() <= b.live_until) is not true;

  insert into public.alert (org_id, booth_id, key, severity)
  select b.org_id, b.id, 'booth.silent', 'critical'
  from public.booth b
  left join public.booth_status s on s.booth_id = b.id
  where b.live_from <= now() and now() <= b.live_until
    and coalesce(s.last_seen_at, '-infinity') < now() - v_silent
    and coalesce((s.heartbeat ->> 'dryRun')::boolean, false) is false
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

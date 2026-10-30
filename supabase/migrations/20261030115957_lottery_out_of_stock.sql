-- The lottery has nothing left to give: the booth's lottery is live and
-- every prize is out of stock, so every visit loses. A warning, since the
-- booth still prints photos. The heartbeat carries the lottery's state
-- (`lottery`: live, stockLeft). A heartbeat without it (a booth from before
-- it, or one that couldn't read its lottery) says nothing about the lottery:
-- it neither opens this alert nor closes one that is open.

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
    'lottery.out-of-stock'
  ));

-- As in 20261020150353_alert_rules, plus the lottery's rule, the engine's
-- isLotteryEmpty in SQL. `unknown` (the printer reconnecting) only holds
-- printer alerts as they are: it says nothing about the lottery. A restock,
-- or switching the lottery off, closes it. `create or replace` keeps the
-- function's grants.
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
    union all
    select 'lottery.out-of-stock', 'warn' where v_lottery_empty
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
      )
  )
  insert into public.alert (org_id, booth_id, key, severity)
  select v_org_id, p_booth_id, key, severity from wanted
  on conflict (booth_id, key) where resolved_at is null do nothing;
end;
$$;

-- How an alert reaches staff phones: the database posts each alert event to
-- the notify Edge Function, which sends the web push. The function's URL and
-- a shared secret live in Vault (set once per project, never in git):
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify', 'notify_url');
--   select vault.create_secret('<random>', 'notify_secret');
--
-- The same random value is the function's NOTIFY_SECRET. Without them, alerts
-- still open and close; nothing is pushed, and a warning says why.

create extension if not exists pg_net with schema extensions;

-- Not exposed by the API: what runs here runs as its owner, so no one can
-- call it from outside.
create schema if not exists private;
revoke all on schema private from public;

-- Reminders count from the last push, and the first one is when it opens.
create function private.alert_stamp_notified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_notified_at := now();
  return new;
end;
$$;

create trigger alert_stamp_notified
  before insert on public.alert
  for each row execute function private.alert_stamp_notified();

-- Queues one alert event (opened, resolved, reminder) for the notify
-- function. pg_net sends it after the transaction commits, so an alert that
-- is rolled back is never pushed.
create function private.post_alert_event(p_alert_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    raise warning 'alert % not pushed: Vault has no notify_url or notify_secret', p_alert_id;
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('alertId', p_alert_id, 'event', p_event),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

create function private.alert_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.post_alert_event(new.id, 'opened');
  elsif old.resolved_at is null and new.resolved_at is not null then
    perform private.post_alert_event(new.id, 'resolved');
  end if;
  return null;
end;
$$;

create trigger alert_notify
  after insert or update of resolved_at on public.alert
  for each row execute function private.alert_notify();

-- A critical alert nobody acknowledged is pushed again every 10 minutes,
-- until it closes or staff acknowledge it.
create function private.remind_open_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert_id uuid;
begin
  for v_alert_id in
    update public.alert
    set last_notified_at = now()
    where severity = 'critical'
      and resolved_at is null
      and acked_at is null
      and last_notified_at <= now() - interval '10 minutes'
    returning id
  loop
    perform private.post_alert_event(v_alert_id, 'reminder');
  end loop;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;

select cron.schedule(
  'alert-reminders',
  '* * * * *',
  'select private.remind_open_alerts()'
);

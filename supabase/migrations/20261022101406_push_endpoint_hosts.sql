-- A device's endpoint is a URL the notify function fetches, and the
-- device's owner writes it: only https on a known push service is accepted,
-- so a stored endpoint can't make the Hub call anything else. The same list
-- is @dither-booth/protocol/push's PUSH_SERVICE_HOSTS.
--
-- The host is null when the endpoint isn't https, and a check passes on
-- null: coalesce makes "not https" a refusal.
alter table public.push_subscription
  add constraint push_subscription_endpoint_push_service check (
    coalesce(
      substring(endpoint from '^https://([^/:?#]+)/') in (
        'web.push.apple.com',
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com'
      )
      or substring(endpoint from '^https://([^/:?#]+)/') like '%.notify.windows.com',
      false
    )
  );

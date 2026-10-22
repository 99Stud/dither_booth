---
title: The Hub
description: The cloud side's database, how to run it locally, and how it's tested.
sidebar:
  order: 7
---

The [Hub](/docs/start-here/glossary/) is a Supabase project in the EU. Its code lives in `supabase/`: migrations, the config for the local stack, and the database tests. The booth never needs it to run an event.

## Run it locally

You need the [Supabase CLI](https://supabase.com/docs/guides/local-development) and Docker (OrbStack works).

```bash
supabase start       # the local stack; applies supabase/migrations
supabase db reset    # rebuild the database from the migrations
supabase test db     # the pgTAP tests in supabase/tests/database
supabase stop
```

The stack uses ports `56320`–`56329`, so it can run next to other Supabase projects on their default `543xx`. Sign-up is off, like production (`[auth] enable_signup`), but the email provider stays on so existing users can log in: add a user from the Studio at `http://127.0.0.1:56323`.

For the Edge Functions, also run `supabase functions serve`; they answer on `http://127.0.0.1:56321/functions/v1/<name>`. You need [Deno](https://deno.com) for their tests.

## What's in the database

| Table               | Holds                                                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `org`, `org_member` | Who may see what. Only `staff` exists.                                                                                                                                                                                                                         |
| `booth`             | One booth: the window (`live_from`, `live_until`) in which silence is an incident, and its registration (the code's hash and expiry, its Auth user, when it registered). Staff read only `id`, `org_id`, `name`, the window, `created_at` and `registered_at`. |
| `booth_status`      | The last [heartbeat](/docs/start-here/glossary/) of each booth.                                                                                                                                                                                                |
| `alert`             | An alert opened from a heartbeat: one open per booth and key.                                                                                                                                                                                                  |
| `push_subscription` | A staff device that gets web push.                                                                                                                                                                                                                             |

Every table has `org_id` and row level security. Rules worth knowing:

- **Staff read their org's rows and write almost nothing.** The only column they write on `alert` is `acked_at`; a trigger records who. They manage their own `push_subscription` rows.
- **A booth never touches these tables.** Its JWT carries `booth_id` in `app_metadata` (never `user_metadata`, which users can edit), and an Edge Function writes with the service role after checking it.
- **No `security definer` functions in `public`**: Postgres lets every role call them.

## Production settings `config.toml` doesn't reach

The deploy applies migrations and Edge Functions, not `config.toml`. Set these once in the `dither-hub` dashboard, under Authentication:

- **Sign In / Providers**: turn off **Allow new users to sign up**, and keep the **Email** provider on (staff log in with a magic link).

A stranger who signed up anyway would see nothing (no org, no booth), but staff and booths are the only accounts there should be.

## How a booth registers

A booth needs its own identity on the Hub, and the Hub's service role must never leave it. So a booth registers once, with a one-time code:

1. Staff create the booth on the Hub and issue a code. Until Studio has a button, run this in the SQL editor:

   ```sql
   select public.issue_booth_registration_code('<booth id>');  -- 7KQ2M-9XD4T
   ```

   The code is ten Crockford base32 characters (no I, L, O or U), valid 24 hours. Only its sha256 is stored, and a new code replaces the old one.

2. In admin, **Settings → Hub**, staff type the code and choose **Register**. The engine posts it to the `register-booth` Edge Function.
3. The function uses the code up, creates a new Auth user for the booth (`booth_id` in `app_metadata`), links it to the booth, then deletes the booth's previous Auth user, which ends that session, and answers with the new session. Each step leaves something a new code can fix: no failure can block the next registration.
4. The engine keeps the refresh token in `hub_registration` (SQLite). It is the booth's only credential on the Hub, and is never shown in admin.

Things to know:

- **A refused code changes nothing.** Any other failure (no answer, a Hub error) may come after the Hub already replaced the booth's registration, so the engine forgets its own and asks for a new code, rather than show a registration that no longer works.
- **Forget the registration** (admin) only forgets it on the booth: it stops reporting. The Hub still lists the booth as registered until it registers again.
- `booth doctor` says whether the booth is registered, read from the engine's database.
- In development, `HUB_URL` and `HUB_PUBLISHABLE_KEY` point the engine at another Hub, such as the local stack (`supabase status`). They are refused with `NODE_ENV=production`.
- **Studio must name its columns** when it reads `booth` (`select('id, name, …')`): staff have no grant on the registration columns, so `select('*')` is refused.

## How a registered booth reports

Once registered, the engine sends a heartbeat every 30 seconds, and at once when the printer's conditions change, so an alert doesn't wait for the next tick. It does nothing while the booth isn't registered.

- **The session.** The access token stays in memory. The refresh token is single use: every renewal returns the next one, which the engine stores before using the access token that came with it.
- **Refused.** If the Hub refuses the session (the booth was registered again elsewhere, or removed), the engine forgets its registration, and admin asks for a new code.
- **Failures.** A Hub that can't be reached keeps the registration; the next tick tries again. Admin's Hub card shows the last report, or why it failed.
- **Release.** The heartbeat's `release` is `git describe` of the checkout the engine runs from.
- **Dry run.** An engine in dry run (`RECEIPT_PRINT_DRY_RUN`) says so, and the Hub never alerts for it.

To try it on a laptop, point the engine at the local stack (`HUB_URL`, `HUB_PUBLISHABLE_KEY` from `supabase status`), register it with a code from the local SQL editor, and watch `booth_status`.

## How alerts open and close

A booth posts its [heartbeat](/docs/start-here/glossary/) to the `heartbeat` Edge Function every 30 seconds. The function takes the booth from the session (`app_metadata.booth_id`, checked with Auth), checks the body against `@dither-booth/protocol`, and calls `evaluate_heartbeat`, which stores it and opens or closes alerts:

| Key                      | Severity | Opens when                                                      |
| ------------------------ | -------- | --------------------------------------------------------------- |
| `printer.paper-out`      | critical | the printer is out of paper                                     |
| `printer.error`          | critical | the printer reports an error                                    |
| `printer.disconnected`   | critical | not connected for a minute                                      |
| `printer.paper-near-end` | warn     | paper is running low                                            |
| `printer.cover-open`     | warn     | the cover is open for a minute                                  |
| `booth.silent`           | critical | no heartbeat for 3 minutes while `live_from`–`live_until` is on |

- An alert closes when its condition clears, and any heartbeat ends a silence. Closed alerts stay as history.
- The minute of grace only holds an alert back from opening. It is counted on the booth's own clock (`changedAt` to `sentAt`), so a Pi with the wrong time doesn't skew it; a negative age (the clock went back) counts as past it. Once open, an alert stays open while its condition holds, whatever else changes.
- `unknown` (the printer reconnecting) leaves printer alerts as they are: it says nothing about the paper.
- A dry-run booth never alerts, and switching to dry run closes what was open.
- A heartbeat older than the one stored (a late retry) is ignored.
- Silence counts from `live_from` at the earliest, so a booth switched on as its window opens has three minutes to report.
- `alert.key` only takes the keys above: a new rule adds its key to the `alert_key_known` constraint.
- `evaluate_silence` runs every minute from `pg_cron` (job `booth-silence`).
- Both functions are for the service role only. The thresholds are constants in the migration, until an event needs others.

## How an alert reaches phones

The database pushes alert events itself:

1. A trigger on `alert` queues **opened** (a new alert) and **resolved** (it closed) for the `notify` Edge Function, through `pg_net`, after the transaction commits.
2. A `pg_cron` job (`alert-reminders`, every minute) queues a **reminder** for each critical alert that is still open, not acknowledged, and was last pushed 10 minutes ago.
3. `notify` checks the shared secret, words the message (the glossary's terms: _Out of paper_, _Paper low_, …), and sends an encrypted web push (VAPID) to every device of the alert's org. A device the push service says is gone (404, 410) is forgotten.

Critical alerts go out with high urgency and live an hour at the push service; "back to normal" goes out with normal urgency. Every push for an alert carries the alert's id as its tag and topic, so a reminder or "back to normal" replaces the notification already on the phone.

### Setting it up on a project

Once per project. Without it, alerts still open and close; nothing is pushed, and Postgres logs a warning per alert.

1. Generate a random secret (`openssl rand -hex 32`).
2. Set the function's secrets:

   ```bash
   supabase secrets set --project-ref <ref> \
     VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:<who push services can contact> \
     NOTIFY_SECRET=<the random secret>
   ```

3. In the SQL editor, tell the database where to post, with the same secret:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify', 'notify_url');
   select vault.create_secret('<the random secret>', 'notify_secret');
   ```

Locally, the function reads `supabase/functions/.env` (ignored by git), and `notify_url` is `http://supabase_kong_dither-booth:8000/functions/v1/notify`: `pg_net` runs inside the database container.

## Tests and CI

Each table's access rules have a pgTAP file in `supabase/tests/database/`. They act as a user with `set local role authenticated` and a `request.jwt.claims` setting, and check both what is allowed and what is refused (`42501`).

The Edge Functions keep their logic in a `handler.ts` that takes its dependencies (Auth, the database) as arguments, so `deno test` covers every answer without a stack. Their bodies are tested with the fixtures from `@dither-booth/protocol/heartbeat.fixtures`. A function imports the protocol by its package exports, mapped in its `deno.json` to the files in `packages/protocol`.

`.github/workflows/hub.yml` runs `supabase db lint --schema public`, `supabase test db`, `deno check` and `deno test` on any change under `supabase/` or `packages/protocol/`. Before committing a migration, run `supabase db advisors --local` too.

The local Postgres image crashes when a role is refused a function, so tests read function grants from the catalog (`has_function_privilege`) instead of calling them as that role.

Migrations are created with `supabase migration new <name>`, never named by hand.

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

| Table               | Holds                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| `org`, `org_member` | Who may see what. Only `staff` exists.                                                  |
| `booth`             | One booth, with the window (`live_from`, `live_until`) in which silence is an incident. |
| `booth_status`      | The last [heartbeat](/docs/start-here/glossary/) of each booth.                         |
| `alert`             | An alert opened from a heartbeat: one open per booth and key.                           |
| `push_subscription` | A staff device that gets web push.                                                      |

Every table has `org_id` and row level security. Rules worth knowing:

- **Staff read their org's rows and write almost nothing.** The only column they write on `alert` is `acked_at`; a trigger records who. They manage their own `push_subscription` rows.
- **A booth never touches these tables.** Its JWT carries `booth_id` in `app_metadata` (never `user_metadata`, which users can edit), and an Edge Function writes with the service role after checking it.
- **No `security definer` functions in `public`**: Postgres lets every role call them.

## How a booth registers

A booth needs its own identity on the Hub, and the Hub's service role must never leave it. So a booth registers once, with a one-time code:

1. Staff create the booth on the Hub and issue a code. Until Studio has a button, run this in the SQL editor:

   ```sql
   select public.issue_booth_registration_code('<booth id>');  -- 7KQ2M-9XD4T
   ```

   The code is ten Crockford base32 characters (no I, L, O or U), valid 24 hours. Only its sha256 is stored, and a new code replaces the old one.

2. In admin, **Settings → Hub**, staff type the code. The engine posts it to the `register-booth` Edge Function.
3. The function uses the code up, creates the booth's Auth user with `booth_id` in `app_metadata`, and answers with the booth's session. Registering a booth again deletes its previous Auth user, which ends that session.
4. The engine keeps the refresh token in `hub_link` (SQLite). It is the booth's only credential on the Hub, and is never shown in admin.

The engine registers with the production Hub unless `HUB_URL` and `HUB_PUBLISHABLE_KEY` point it elsewhere, such as the local stack (`supabase status`).

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

## Tests and CI

Each table's access rules have a pgTAP file in `supabase/tests/database/`. They act as a user with `set local role authenticated` and a `request.jwt.claims` setting, and check both what is allowed and what is refused (`42501`).

The Edge Functions keep their logic in a `handler.ts` that takes its dependencies (Auth, the database) as arguments, so `deno test` covers every answer without a stack. Their bodies are tested with the fixtures from `@dither-booth/protocol/heartbeat.fixtures`. A function imports the protocol by its package exports, mapped in its `deno.json` to the files in `packages/protocol`.

`.github/workflows/hub.yml` runs `supabase db lint --schema public`, `supabase test db`, `deno check` and `deno test` on any change under `supabase/` or `packages/protocol/`. Before committing a migration, run `supabase db advisors --local` too.

The local Postgres image crashes when a role is refused a function, so tests read function grants from the catalog (`has_function_privilege`) instead of calling them as that role.

Migrations are created with `supabase migration new <name>`, never named by hand.

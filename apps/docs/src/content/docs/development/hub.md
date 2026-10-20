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

The stack uses ports `56320`–`56329`, so it can run next to other Supabase projects on their default `543xx`. Local sign-up is off, like production: add a user from the Studio at `http://127.0.0.1:56323`.

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

## Tests and CI

Each table's access rules have a pgTAP file in `supabase/tests/database/`. They act as a user with `set local role authenticated` and a `request.jwt.claims` setting, and check both what is allowed and what is refused (`42501`).

`.github/workflows/hub.yml` runs `supabase db lint` and `supabase test db` on any change under `supabase/`. Before committing a migration, run `supabase db advisors --local` too.

Migrations are created with `supabase migration new <name>`, never named by hand.

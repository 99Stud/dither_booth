---
title: The Hub
description: The cloud side's database, how to run it locally, and how it's tested.
sidebar:
  order: 8
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

The stack uses ports `56320`–`56329`, so it can run next to other Supabase projects on their default `543xx`. Sign-up is off, like production (`[auth] enable_signup`), but the email provider stays on so existing users can log in: add a user from the local Supabase dashboard at `http://127.0.0.1:56323`.

For the Edge Functions, also run `supabase functions serve`; they answer on `http://127.0.0.1:56321/functions/v1/<name>`. You need [Deno](https://deno.com) for their tests.

## What's in the database

| Table               | Holds                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `org`, `org_member` | Who may see what. A member's `role` is `member` (the default) or `owner`: an owner manages the team's members in Studio's **Team**, through the `team` function.                                                                                                                                 |
| `platform_admin`    | The platform admins: one row per user. A user reads only their own row; rows are added from the SQL editor.                                                                                                                                                                                      |
| `booth`             | One booth: its [event times](/docs/start-here/glossary/) (`live_from`, `live_until`), when silence is an alert, and its registration (the code's hash and expiry, its Auth user, when it registered). Staff read only `id`, `org_id`, `name`, the event times, `created_at` and `registered_at`. |
| `booth_status`      | The last [heartbeat](/docs/start-here/glossary/) of each booth.                                                                                                                                                                                                                                  |
| `alert`             | An alert opened from a heartbeat: one open per booth and key.                                                                                                                                                                                                                                    |
| `push_subscription` | A staff device that gets web push. Its `(org_id, user_id)` is a membership: removing someone from a team removes their devices on it.                                                                                                                                                            |
| `booth_update`      | The [update request](/docs/start-here/glossary/#releases) staff made for a booth from Studio, one per booth: the release, who asked and when, and how the booth says it goes (`requested`, `waiting`, `running`, `done`, `failed`, `rolled-back`, with the booth's reason).                      |

Every table has `org_id` and row level security. Rules worth knowing:

- **Who sees a team.** Its members, and every platform admin. Policies say so with `org_id in (select public.visible_org_ids())`: the caller's teams, or every team for an admin. `org` and `org_member` check memberships and `is_platform_admin()` themselves, since `visible_org_ids()` reads them and would recurse.
- **Platform admins act as staff of every team**: they read, add booths, set event times, acknowledge alerts, ask booths to update and add teams (`insert (name)` on `org`). They get no push for a team they aren't in: a user can only add a device for a team they're in.
- **Staff read their org's rows and write little.** On `booth` they add one to their org (`org_id`, `name`) and set its event times (`live_from`, `live_until`); never its registration, nor its name. The only column they write on `alert` is `acked_at`; a trigger records who. Asking a booth to update again closes its **Update failed** alert: the request trigger (`private.booth_update_requested`, `security definer`) does it for that booth only, without giving staff the column. They manage their own `push_subscription` rows. Nobody writes `org_member` directly: the `team` function does (below).
- **Update requests.** On `booth_update` staff insert a row for their org's booth (`booth_id`, `org_id`, `release`), change its `release` (asking again), or delete it (cancel). A trigger sets who asked and when and resets the state to `requested`. Only the heartbeat function writes the state, through `report_booth_update`.
- **Realtime** publishes `alert`, `booth_status` and `booth_update`, so Studio updates without polling. It applies the same row level security: staff only hear about their team's rows, and a platform admin about every team's.
- **A booth never touches these tables.** Its JWT carries `booth_id` in `app_metadata` (never `user_metadata`, which users can edit), and an Edge Function writes with the service role after checking it.
- **No `security definer` functions in `public`**: Postgres lets every role call them.

## Production settings come from `config.toml`

Every deploy (see [Releases](/docs/development/releases/)) makes the project's API, database, Auth and Storage settings match `supabase/config.toml`, as Supabase recommends for email templates. `[remotes.production]` at the end of the file holds the values production needs instead of the local ones: `site_url` (Studio, `https://studio.ditherbooth.com`), no extra redirect URLs, email confirmations and TOTP on.

So **change production settings in `config.toml`, never in the dashboard**: the next deploy puts back whatever the file says. Among them:

- **Sign-up is off** (`[auth] enable_signup = false`) while the Email provider stays on, so staff log in with a code. A stranger who signed up anyway would see nothing (no org, no booth), but staff and booths are the only accounts there should be.
- **Codes are 6 digits** (`otp_length`), the length Studio's code field takes.
- **The sign-in email** is `supabase/templates/magic_link.html`, with the code in its subject.

To see how production differs from the file, run `supabase config push --project-ref <ref>` from your machine and answer `n`. The prompt defaults to yes, so type the `n` yourself: don't pipe it in.

## How a booth registers

A booth needs its own identity on the Hub, and the Hub's service role must never leave it. So a booth registers once, with a one-time code:

1. Staff add the booth in Studio (Booths) and choose **Get a registration code**. That calls the `booth-code` Edge Function, which checks the caller is staff of the booth's org or a platform admin, and issues the code with the service role. Without Studio, the SQL editor does the same:

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
- **Release.** The heartbeat's `release` is the version in `release.json` when the engine runs from a [release bundle](/docs/development/releases/), else `git describe` of the checkout it runs from.
- **Dry run.** An engine in dry run (`RECEIPT_PRINT_DRY_RUN`) says so, and the Hub never alerts for it.
- **Updates.** The answer is `{ ok: true, update }`: `update` is `{ release }` while a request from Studio is `requested` or `waiting`, else null. The heartbeat function gets it from `report_booth_update(booth_id, heartbeat)` after `evaluate_heartbeat`. That function also records the heartbeat's optional `update` report (`{ release, state, error }`) when its release is the one asked for, opens a `booth.update-failed` alert when it reports `failed` or `rolled-back`, and marks the request `done` (closing that alert) once the heartbeat's `release` is it. A booth from before updates sends no report and ignores the answer's `update`; a Hub from before it drops the report. See [Updates](/docs/architecture/updates/#from-studio).

To try it on a laptop, point the engine at the local stack (`HUB_URL`, `HUB_PUBLISHABLE_KEY` from `supabase status`), register it with a code from local Studio or the local SQL editor, and watch `booth_status`.

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
- Silence counts from `live_from` at the earliest, so a booth switched on as its event starts has three minutes to report.
- `alert.key` only takes the keys above: a new rule adds its key to the `alert_key_known` constraint.
- `evaluate_silence` runs every minute from `pg_cron` (job `booth-silence`).
- Both functions are for the service role only. The thresholds are constants in the migration, until an event needs others.

## How an alert reaches staff devices

The database pushes alert events itself:

1. A trigger on `alert` queues **opened** (a new alert) and **resolved** (it closed) for the `notify` Edge Function, through `pg_net`, after the transaction commits.
2. A `pg_cron` job (`alert-reminders`, every minute) queues a **reminder** for each critical alert that is still open, not acknowledged, and was last pushed 10 minutes ago.
3. `notify` checks the shared secret, words the message from `@dither-booth/protocol/alerts` (the glossary's terms), and sends an encrypted web push (VAPID) to every [device](/docs/start-here/glossary/) of the alert's org at once. A device the push service says is gone (404, 410, or Apple's 400 `BadWebPushToken`) is forgotten. Its answer counts what was sent, removed and failed, and lists every refusal by push service, which the function's log keeps too.

Critical alerts go out with high urgency and live an hour at the push service; "back to normal" goes out with normal urgency. Every push for an alert carries the alert's id as its tag and topic, so a reminder or "back to normal" replaces the notification already on the device. Each push also says when what it reports happened (`at`): two pushes for one alert can arrive out of order, and the Studio app keeps the newer one.

**Only push services are fetched.** A device's endpoint is a URL its owner writes and `notify` fetches, so the database only accepts `https` on Apple's, Google's, Mozilla's and Windows' push services (`push_subscription_endpoint_push_service`, the same list as `@dither-booth/protocol/push`), and `notify` refuses and forgets anything else without fetching it.

**A push that fails is not retried.** `pg_net` calls `notify` once: if that call fails, a warning's only push is lost, and a critical alert's next chance is its reminder, up to about 11 minutes later. The alert itself is never lost; Studio shows it.

`send-test` pushes a test notification to the caller's own devices (it takes the caller's session), for the Studio app's "Send test notification" button.

### The team function

`team` is Studio's **Team**: one POST, with the caller's session, per action (`list`, `add`, `remove`, `set-role`; the shapes are `@dither-booth/protocol/team`). It uses the service role, because a team's list needs its members' addresses (Auth) and their devices, which no member may read, and adding someone needs a login.

- **Who.** A team's members read it. Its owners and every platform admin change it; a member gets `403`. Anyone else gets `404`, as for a team that doesn't exist.
- **Adding** makes a confirmed Auth user with no password and sends no email: the person signs in with Studio's code, as all staff do. An address that already has a login (on another team) joins as it is. Auth has no lookup by address, so the function reads every user, a page at a time; at a few dozen that's nothing, past a thousand it wants a SQL lookup instead.
- **Refusals** carry a `reason`: `already-member` (`409`), `booth-login` (`422`: a booth's Auth user, `app_metadata.booth_id`, never joins a team), `own-row` (`422`: nobody removes or demotes themselves, so nobody locks themselves out; a platform admin can still fix any team), `not-a-member` (`404`).
- **Removing** keeps the person's login: they may be in another team. Their devices on this team go with the membership (the foreign key above), so their phones stop getting its alerts at once.

### Setting it up on a project

Once per project. Without it, alerts still open and close; nothing is pushed, and Postgres logs a warning per alert.

1. Generate the VAPID key pair once (`bunx web-push generate-vapid-keys`), and a random secret (`openssl rand -hex 32`).
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

Locally, the functions read `supabase/functions/.env` (ignored by git) for the same four values, and the Vault secrets are created the same way in the local SQL editor, with `notify_url` set to `http://supabase_kong_dither-booth:8000/functions/v1/notify`: `pg_net` runs inside the database container. A reset (`supabase db reset`) empties Vault, so create them again after one.

## Tests and CI

Each table's access rules have a pgTAP file in `supabase/tests/database/`. They act as a user with `set local role authenticated` and a `request.jwt.claims` setting, and check both what is allowed and what is refused (`42501`).

The Edge Functions keep their logic in a `handler.ts` that takes its dependencies (Auth, the database) as arguments, so `deno test` covers every answer without a stack. Their bodies are tested with the fixtures from `@dither-booth/protocol/heartbeat.fixtures`. A function imports the protocol by its package exports, mapped in its `deno.json` to the files in `packages/protocol`.

`.github/workflows/hub.yml` runs `supabase db lint --schema public`, `supabase test db`, `deno check` and `deno test` on any change under `supabase/` or `packages/protocol/`. Before committing a migration, run `supabase db advisors --local` too.

The local Postgres image crashes when a role is refused a function, so tests read function grants from the catalog (`has_function_privilege`) instead of calling them as that role.

Migrations are created with `supabase migration new <name>`, never named by hand.

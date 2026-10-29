---
title: Updates
description: How `booth update` installs a release side by side, switches to it, checks it and rolls back on its own, and how `booth rollback` goes back by hand.
sidebar:
  order: 11
---

A booth runs one [release](/docs/start-here/glossary/#releases) at a time. `booth update` installs the next one next to it, switches with one rename, checks that the booth came back, and goes back on its own when it didn't. The booth keeps serving guests until the switch; only the restart takes it down. Why it is built this way: [decision 0009](/docs/decisions/0009-booths-install-releases-side-by-side/).

Code: `apps/cli/src/internal/update/` (`update.ts` runs a job; `update.host.ts` is the Pi it acts on). The status the admin will read: `packages/shared/src/isomorphic/booth-update.ts`.

## Layout

```text
/opt/dither-booth           → dither-booth-releases/0.8.0      the path the unit, logrotate and the dispatcher name
/opt/dither-booth-releases/
  0.8.0/                    the running release (a release bundle, unpacked)
  legacy-0.7.2-2-g806eca4/  the one before: here, the git checkout the booth ran until its first update
/opt/dither-booth-shared/
  .local/                   certificates, the setup ticket, tokens
  logs/                     the PM2 logs
```

Each release links `.local` and `logs` to `/opt/dither-booth-shared/`, and `apps/engine/data` to the database folder on the SSD, so nothing a booth writes lives inside a release. A release folder has no `.git`: nothing can check out over its links. Two releases are kept, the running one and the one before; older ones are deleted after an update succeeds.

## One update, step by step

`sudo booth update [version]`, or the unit `ditherbooth-update@<version>.service`; with no version, the latest release that isn't a pre-release. Each step is written to `/var/lib/ditherbooth/update/status.json` as it starts.

| Step        | What it does                                                                                                                                                                                                      | On failure                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `preflight` | Takes the lock, ends a job a crash left behind (see [Interrupted jobs](#interrupted-jobs)), resolves "latest", checks the version, arm64, 1 GB free next to the releases, and that the release has a `SHA256SUMS` | Nothing changed           |
| `cli`       | Downloads the release's `booth` binary and checks it. When it differs from the one running, installs it to `/usr/local/bin/booth` and hands the job over: `booth update <version> --resume <job>` does the rest   | Nothing changed           |
| `download`  | Downloads the bundle to `/var/cache/ditherbooth/` and checks it against `SHA256SUMS`. A copy already there that matches is reused                                                                                 | Nothing changed           |
| `unpack`    | On a checkout, moves its `.local` and `logs` to shared first and links them back. Unpacks the bundle as `pi` into `<version>.tmp`, links it, renames it to `<version>`                                            | Nothing changed           |
| `backup`    | `VACUUM INTO /mnt/ssd/dither-booth/backups/update-<job>-<from>-to-<to>.sqlite`, and records how many migrations the database has. The last 3 backups are kept                                                     | Nothing changed           |
| `switch`    | On a checkout, moves it to `legacy-<git describe>`. Points `/opt/dither-booth` at the new release: a new link, renamed over the old one                                                                           | Goes back                 |
| `setup`     | Runs this CLI's `service` and `network setup` steps: the units, the polkit rules, log rotation. After the switch, so the restarts they'd need (a new journal group, a changed network watch) fold into the next   | Goes back                 |
| `restart`   | `systemctl restart ditherbooth.service`                                                                                                                                                                           | Goes back                 |
| `check`     | Up to 120 s: the three PM2 processes `online` for at least 15 s (past PM2's 10 s `min_uptime`, so not restarting in a loop) and the engine's `/healthz` answering                                                 | Goes back                 |
| `rollback`  | Only after a failure from `switch` on: stops the booth, counts the migrations again and restores the backup only if the new release added one, points the link back, starts, checks again                         | Reported as `rolled-back` |

The booth serves guests through every step up to `switch`. Every refusal (no internet for "latest", not arm64, no such release, no room) is a `failed` job in `status.json`, so the admin and the Hub see it; only a booth already on the version records nothing. The job ends `done`, `failed` (the booth still runs the old release: nothing past `backup` happened) or `rolled-back` (the new release didn't come up; the booth went back). Finished jobs go to `history.json`, newest first, 20 kept.

The booth's first update turns its checkout into a release: the checkout itself becomes `legacy-<git describe>`, with its `.local` and `logs` moved to shared and linked back, so a rollback can return to it and still runs. `git describe` runs with the checkout named as `safe.directory`, since root runs it in `pi`'s repository.

## Interrupted jobs

A job records its process id in `status.json`. A job still `running` whose process is gone was interrupted: the release's own CLI died after the handover, the unit hit its 45 min timeout, the Pi lost power or ran out of memory. `booth update --recover` ends it:

- **Before the switch** (`/opt/dither-booth` still points at the old release): it removes the half-unpacked folder and records `failed`, "Interrupted during <step>. Nothing changed."
- **After the switch**: it goes back as a failed check does, restoring the backup only if the new release added a migration, and records `rolled-back`.
- **While the process lives**: it does nothing.

It runs in four places, so no interrupted job is left `running`: after the CLI it handed over to exits; as the update unit's `ExecStopPost`, however its process ended; as `ditherbooth.service`'s `ExecStartPre` (as root, `--no-restart`), so a booth that lost power mid-update starts on the release before; and before every new update or rollback. The admin and the engine treat a `running` job whose process is gone as not running.

## Rolling back by hand

`sudo booth rollback` goes back to the release the last successful update came from, found in the history, while its folder is still on the booth. After every job the CLI writes where a rollback would go to `/var/lib/ditherbooth/update/rollback.json` (the release, whether the newer one migrated, the backup and when it was taken), which the admin offers as is: it never offers what the CLI would refuse. When that update applied migrations, the older release can't run on the database as it is, and rollback refuses unless it is told to restore the backup taken before the update: `sudo booth rollback --restore-db`. Everything the booth recorded since that backup (visits, draws) is lost. The units are `ditherbooth-rollback@keep-db.service` and `ditherbooth-rollback@restore-db.service`.

A rollback whose release doesn't come up within 120 s switches back to the release it left.

## From admin

The System page's **Software** panel ([Update the software](/docs/maintenance/system/#update-the-software)) reads and writes through **`/admin/update`** on the admin server, served only under PM2, on the booth (`apps/admin/src/lib/update/`):

- `GET` is the snapshot: the release the admin runs (`readRelease`, at start), whether it is a release bundle (`release.json`) or a checkout, the latest release on GitHub, `status.json` as the job and whether its process still runs (a `running` job whose process is gone is over: the booth ends it at its next start), the job's last 40 journal lines, `rollback.json` as where a rollback goes, and the room free next to the releases against the 1 GB an update needs.
- The admin server asks GitHub's `releases/latest` at start and every **6 h**; `POST {action: "check"}` asks at once. No answer is the state `unreachable`, not an error.
- `POST {action: "install", version}` runs `systemctl --no-block start ditherbooth-update@<version>.service`; `POST {action: "rollback", mode}` starts `ditherbooth-rollback@<mode>.service`. A version must be a release version; a job that runs (process and all) answers 409; a `keep-db` rollback across a migration, or a rollback with nothing to go back to, answers 409. Polkit refusing, or a unit not installed, comes back as "Run `sudo booth service` on the booth."

The install dialog asks the engine for the event (`config.getCurrentEvent`), the visits of the last 15 min (`config.getVisitStats`) and whether a ticket is printing (`ops.getHealthz`, the printer's `printing`), and shows them as warnings; only the snapshot's own checks (GitHub reachable, room, nothing running) block. The page reads the snapshot every **3 s** while a job runs, and every 60 s otherwise. It keeps reading while the admin server restarts under it. Once the admin answers with another release, the page reloads: its code is the old release's. The Shutter on the iPad does the same through the kiosk channel's `release` opening message ([Kiosk channel](/docs/architecture/kiosk-channel/#commands)). A unit that starts but writes no job within 60 s is reported on the panel rather than waited on.

The job's output (the `booth` CLI's lines) is on the Logs page, under **System**: the journal source reads `SYSLOG_IDENTIFIER=booth`, since the units are named by version and a journal match takes no wildcard. The panel's **Details** shows the same lines since the job started, read by the admin server with `journalctl --identifier=booth`.

Motion, with anime.js as the rest of the page: the gauge's share tweens to each new step, a step that ends pops its check and the next slides in, and the result's mark (a check, an arrow back, a cross) draws itself once. `System.motion.tsx` holds every duration; `prefers-reduced-motion` turns all of it off. Nothing loops but the running step's spinner.

## From Studio

Staff ask a booth to update from Studio's **Booths** ([Studio](/docs/development/studio/#how-it-works)). The booth is often offline, and the Hub never reaches into it ([decision 0010](/docs/decisions/0010-studio-asks-the-booth-decides/)): the request waits on the Hub, and the booth reads it in its heartbeat's answer.

```text
Studio   insert booth_update {booth, release}                       state requested
Hub      heartbeat answer: { ok, update: { release } }               while requested | waiting
engine   quiet?  no  → next heartbeat: update {release, waiting, why}   state waiting
                 yes → systemctl --no-block start ditherbooth-update@<release>.service
         next heartbeats: update {release, running | done | failed | rolled-back, error}
Hub      heartbeat release = asked release → done
```

- **Quiet** (`readQuietness`, `apps/engine/src/domains/hub/internal/hub-updates.ts`): no active event between its start and end, no active event that started with no end (then: update from admin on the booth), and no visit started in the last **15 min**.
- **The booth keeps nothing.** The Hub repeats the request in every answer until the booth reports it running, so a request survives the engine's own restart. After the update restarts the engine, its next heartbeats report the job from `status.json` (for a day), or simply run the new release, which marks the request done.
- Only under PM2, on the booth. A unit that can't start (polkit, a missing unit) is reported as `failed` with the reason.

## Why its own unit

The admin runs as `pi`, under PM2, which an update restarts. The update runs as root in a oneshot unit of its own (`Nice=10`, idle I/O, up to 45 min), so it outlives the PM2 restart and the admin that started it. systemd runs one job per unit at a time; `/var/lib/ditherbooth/update/lock`, holding the job's pid, stops an update and a rollback, or two versions, at once. A lock whose process is gone is taken over.

`pi` may start only these units, through the system polkit rule: `ditherbooth-update@<version>.service`, where the version must look like `0.8.0` or `0.8.0-rc.1` (systemd writes the `-` as `\x2d`), and the two rollback units. The CLI checks the version again. See [Access control](/docs/architecture/access-control/#system-privileges).

## What it trusts

The bundle and the CLI come from the repository's GitHub releases over HTTPS. `SHA256SUMS` proves a download is complete and intact, not who built it. Anyone who can push a `v*` tag can ship code to booths, which is why only admins can ([Repository rules](/docs/development/repository-rules/)).

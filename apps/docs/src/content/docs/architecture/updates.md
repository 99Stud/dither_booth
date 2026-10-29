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

| Step        | What it does                                                                                                                                                                                                    | On failure                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `preflight` | Takes the lock, checks the version, 1 GB free next to the releases, and that the release has a `SHA256SUMS`                                                                                                     | Nothing changed           |
| `cli`       | Downloads the release's `booth` binary and checks it. When it differs from the one running, installs it to `/usr/local/bin/booth` and hands the job over: `booth update <version> --resume <job>` does the rest | Nothing changed           |
| `download`  | Downloads the bundle to `/var/cache/ditherbooth/` and checks it against `SHA256SUMS`. A copy already there that matches is reused                                                                               | Nothing changed           |
| `unpack`    | On a checkout, moves its `.local` and `logs` to shared first and links them back. Unpacks the bundle as `pi` into `<version>.tmp`, links it, renames it to `<version>`                                          | Nothing changed           |
| `setup`     | Runs this CLI's `service` and `network setup` steps: the units, the polkit rules, log rotation. Both change nothing when up to date                                                                             | Nothing changed           |
| `backup`    | `VACUUM INTO /mnt/ssd/dither-booth/backups/update-<job>-<from>-to-<to>.sqlite`, and counts the applied migrations. The last 3 backups are kept                                                                  | Nothing changed           |
| `switch`    | On a checkout, moves it to `legacy-<git describe>`. Points `/opt/dither-booth` at the new release: a new link, renamed over the old one                                                                         | Goes back                 |
| `restart`   | `systemctl restart ditherbooth.service`                                                                                                                                                                         | Goes back                 |
| `check`     | Up to 120 s: the three PM2 processes `online` for at least 15 s (past PM2's 10 s `min_uptime`, so not restarting in a loop) and the engine's `/healthz` answering. Counts the migrations again                  | Goes back                 |
| `rollback`  | Only after a failure from `switch` on: stops the booth, restores the backup unless the new release applied no migration, points the link back, starts, checks again                                             | Reported as `rolled-back` |

The job ends `done`, `failed` (the booth still runs the old release: nothing past `backup` happened) or `rolled-back` (the new release didn't come up; the booth went back). Finished jobs go to `history.json`, newest first, 20 kept.

The booth's first update turns its checkout into a release: the checkout itself becomes `legacy-<git describe>`, with its `.local` and `logs` moved to shared and linked back, so a rollback can return to it and still runs.

## Rolling back by hand

`sudo booth rollback` goes back to the release the last successful update came from, found in the history. When that update applied migrations, the older release can't run on the database as it is, and rollback refuses unless it is told to restore the backup taken before the update: `sudo booth rollback --restore-db`. Everything the booth recorded since that backup (visits, draws) is lost. The units are `ditherbooth-rollback@keep-db.service` and `ditherbooth-rollback@restore-db.service`.

A rollback whose release doesn't come up within 120 s switches back to the release it left.

## Why its own unit

The admin runs as `pi`, under PM2, which an update restarts. The update runs as root in a oneshot unit of its own (`Nice=10`, idle I/O, up to 45 min), so it outlives the PM2 restart and the admin that started it. systemd runs one job per unit at a time; `/var/lib/ditherbooth/update/lock`, holding the job's pid, stops an update and a rollback, or two versions, at once. A lock whose process is gone is taken over.

`pi` may start only these units, through the system polkit rule: `ditherbooth-update@<version>.service`, where the version must look like `0.8.0` or `0.8.0-rc.1` (systemd writes the `-` as `\x2d`), and the two rollback units. The CLI checks the version again. See [Access control](/docs/architecture/access-control/#system-privileges).

## What it trusts

The bundle and the CLI come from the repository's GitHub releases over HTTPS. `SHA256SUMS` proves a download is complete and intact, not who built it. Anyone who can push a `v*` tag can ship code to booths, which is why only admins can ([Repository rules](/docs/development/repository-rules/)).

---
title: Logs
description: Where each part of the booth logs, and how to read it.
sidebar:
  order: 4
---

## Where logs go

| Source                                                    | Where                                                                           | Read with                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| Engine, Shutter server, Admin server                      | PM2 log files in `/opt/dither-booth/logs/pm2/` (`<process>.log`), rotated daily | `tail -f` or PM2, below                     |
| `ditherbooth.service` (start, stop, certificate re-issue) | journald                                                                        | `journalctl -u ditherbooth.service`         |
| Network watch (booth Wi-Fi, mDNS name)                    | journald                                                                        | `journalctl -u ditherbooth-network.service` |
| NetworkManager (Wi-Fi joins, failures)                    | journald                                                                        | `journalctl -u NetworkManager`              |
| Kernel (USB plug/unplug, under-voltage)                   | journald                                                                        | `journalctl -k` or `dmesg`                  |

The PM2 process names are `dither-booth-engine`, `dither-booth-shutter` and `dither-booth-admin`.

`booth service` adds `pi` to the `systemd-journal` group, so `pi` and the apps PM2 runs as `pi` can read the whole journal without `sudo`.

## Reading PM2 logs

PM2's daemon belongs to the service user, so ask it as `pi` from the repo:

```bash
cd /opt/dither-booth
bun run pm2:list                         # status, restarts, memory
bun run pm2:logs                         # all processes, live
bun run pm2:logs-app dither-booth-engine # one process
```

Or read the files directly. Each process writes **one file**, `logs/pm2/<process>.log`, holding both its stdout and its stderr. Each line is one JSON object:

```json
{
  "message": "[kiosk] …\n",
  "timestamp": "2026-10-27T15:00:18.644Z",
  "type": "err",
  "process_id": 0,
  "app_name": "dither-booth-engine"
}
```

| Field       | What                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `message`   | What the process printed, as PM2 received it: one or more lines, `[kiosk]` events included, newline and all |
| `timestamp` | When PM2 received it, ISO 8601 in UTC                                                                       |
| `type`      | `out` (stdout) or `err` (stderr). The apps log errors and warnings to stderr                                |
| `app_name`  | The PM2 process name                                                                                        |

```bash
tail -f /opt/dither-booth/logs/pm2/dither-booth-engine.log
grep '"type":"err"' /opt/dither-booth/logs/pm2/dither-booth-engine.log | tail
```

A `grep` finds whole entries: one entry is never split across two lines. A burst of output can arrive as one entry with several lines in its `message`.

Booths updated from an older release still have `<process>-out.log` and `<process>-err.log` next to the new files. PM2 no longer writes them and rotation leaves them alone; delete them once you no longer need them.

## Rotation

logrotate rotates the three files, with the rule `booth service` installs at `/etc/logrotate.d/ditherbooth`:

- **When:** once a day, and also when a file is over **20 MB** at logrotate's run. Raspberry Pi OS runs logrotate once a day (`logrotate.timer`), so a file can pass 20 MB before that run.
- **How many:** the last **7** rotated files per process, gzip-compressed (`dither-booth-engine.log.1.gz` … `.7.gz`). Older ones are deleted.
- **How:** copy, then truncate in place (`copytruncate`), as `pi`. PM2 keeps writing to the same file, with no restart. A line written during the copy can be lost.

Rotation works offline, with the Pi's own logrotate. `booth doctor` fails when the rule is missing. To rotate now, for example on a full disk:

```bash
sudo logrotate --force /etc/logrotate.d/ditherbooth
```

## Log events

The apps log structured events: a level, a **source** and an **event name**, plus details. Search by event name.

| Source                | Events worth knowing                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.server`       | `server-started`; `trpc-request-failed`, with the procedure path and error code                                                                                                                                                                                                                   |
| `engine.printer`      | `printer-status-changed` (with `conditions` and the `raw` packet), `printer-connected`, `printer-disconnected`, `printer-maintenance-entered`, `printer-maintenance-left`, `lottery-ticket-print-failed`, `receipt-print-dry-run-enabled`, `printer-dry-run-saved`, `printer-dry-run-text-ticket` |
| `engine.kiosk`        | `kiosk-page-connected`, `kiosk-page-disconnected`, `kiosk-maintenance-changed`, `kiosk-reload-sent`, `camera-preview-started`                                                                                                                                                                     |
| `engine.device-setup` | `wifi-join-failed`, `setup-ticket-printed`                                                                                                                                                                                                                                                        |
| `engine.darkroom`     | `darkroom-unlocked`, `darkroom-unlock-refused`, `darkroom-pin-changed`                                                                                                                                                                                                                            |
| `engine.browser`      | `browser-launch-failed`, `browser-close-failed` (the receipt Chromium)                                                                                                                                                                                                                            |
| `engine.event`        | `event-kit-unknown`: an event names a kit this release doesn't ship; the default kit prints instead                                                                                                                                                                                               |
| `engine.lottery`      | draw and lottery-ticket failures                                                                                                                                                                                                                                                                  |

To follow one thing across a visit, grep by source: `grep engine.printer …/dither-booth-engine.log`.

## Process restarts

PM2 restarts a process that crashes, with exponential backoff, up to 10 times in a row (a process must stay up 10 s to count as started). It also restarts a process that grows past its memory cap: **1 GB** for the engine (Chromium lives in it), **256 MB** for each web server.

A process that keeps restarting shows a high restart count in `bun run pm2:list`. Its log's last `"type":"err"` lines tell you why.

```bash
journalctl -u ditherbooth.service --since "1 hour ago"
```

shows whether the whole service restarted, for example because the network gave the booth a new address (that restart is expected: it re-issues the certificate).

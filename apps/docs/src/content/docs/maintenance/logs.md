---
title: Logs
description: Where each part of the booth logs, and how to read it.
sidebar:
  order: 4
---

## Where logs go

| Source                                                    | Where                                                                           | Read with                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------- |
| Engine, Shutter server, Admin server                      | PM2 log files in `/opt/dither-booth/logs/pm2/` (`<process>.log`), rotated daily or past 20 MB | `tail -f` or PM2, below                     |
| Browsers: the Shutter on the iPad, admin on staff phones  | Warnings and errors only, in the log of the server that served the page         | [Browser reports](#browser-reports), below  |
| `ditherbooth.service` (start, stop, certificate re-issue) | journald                                                                        | `journalctl -u ditherbooth.service`         |
| Network watch (booth Wi-Fi, mDNS name)                    | journald                                                                        | `journalctl -u ditherbooth-network.service` |
| NetworkManager (Wi-Fi joins, failures)                    | journald                                                                        | `journalctl -u NetworkManager`              |
| Kernel (USB plug/unplug, under-voltage)                   | journald                                                                        | `journalctl -k` or `dmesg`                  |

The PM2 process names are `dither-booth-engine`, `dither-booth-shutter` and `dither-booth-admin`.

The admin server reads the three PM2 files and the four journald rows above and streams them to admin's [Logs page](#open-logs) over `/admin/logs`: see [Logging](/docs/architecture/logging/). The journald rows are the **System** service there; each line's source is its unit (`NetworkManager.service`) or `kernel`, and journald's priority sets its level (emergency to error → error, warning → warn, the rest → info). On a machine without `journalctl`, such as a Mac in development, System shows as unavailable.

## Open Logs

No SSH needed: admin's **Logs** page shows the Engine, the Shutter, the admin, the system (Wi-Fi, USB, power) and the browsers' reports in one live timeline, newest at the bottom.

- **On a laptop:** in admin's sidebar, at the bottom next to **Docs**, click **Logs**.
- **On a phone:** tap **Settings**, then **Open Logs** on the **Logs** card.
- **From a red health item:** **Control Center → Health checks**, open the item, then **View logs**. The page opens already filtered:

| Health item         | View logs shows                                      |
| ------------------- | ---------------------------------------------------- |
| **Shutter**         | The Shutter server's lines                           |
| **Engine**          | The Engine's lines                                   |
| **Ticket renderer** | Source `engine.browser` (the receipt Chromium)       |
| **Camera**          | Source `shutter.camera` (reports from the iPad)      |
| **Printer**         | Source `engine.printer`, **Error** and **Warn** only |

The page is at `https://<booth>.local:3002/logs`. Its filters are in the address, so a filtered view is a link: **⋯ → Copy link to this view** and send it.

### Reading the page

- **The badge** top right: **Live** (new lines arrive), **Paused**, **Reconnecting** or **Offline**. Offline shows a banner with **Retry now**.
- **Each line:** time to the millisecond, service, level (**Error**, **Warn**, **Info**, with an icon), source, event, and a preview of its details. Error lines are tinted. Lines that aren't events (a crash trace) show as they are.
- **Click a line** (or Enter) to open it: its details, the error and its stack, the raw line, **Copy JSON** and **Copy line**. On a phone, the line opens in a sheet.
- **Dividers** mark moments: “Engine restarted · 14:02:15”, “Admin log rotated · …”, “Connection lost”, then “Reconnected · no lines missed”, or “Reconnected · some lines may be missing” when a log was rotated in between. Restart dividers show whatever the level, source or search, so the printer's **View logs** shows Engine restarts too. Only hiding the service hides them.

### Filtering

- **Service chips:** **Engine**, **Shutter**, **Admin**, **System**, **Browser**. Click one to hide or show its lines. A red number is its error count; a crossed circle means its source is unavailable (hover for why: not running under PM2, or system logs unavailable).
- **Level toggles:** **Error**, **Warn**, **Info**, each with its count.
- **Source:** **All sources**, or one source seen so far (`engine.printer`, `engine.lottery`…).
- **Search:** press **/** to jump to it. Matches are marked. **Esc** clears it.
- **⋯ → Clear filters**, or **Clear filters** on the “No lines match” screen, shows everything again.

On a phone, the chips scroll sideways; levels, source and **Wrap lines** are under **Filters**.

### Following and history

- At the bottom, the list follows new lines. Scroll up and it stays put: a “N new lines · Jump to latest” pill appears. Tap it, or press **End**.
- An open line also holds the list still while you read it.
- **Pause** freezes the list; new lines wait, and the badge counts them. **Resume** shows them.
- Scroll to the top to load older lines, filtered on the booth, so “all errors today” works however far back they are. The page keeps at most 10,000 lines.
- **Wrap lines** shows long lines in full.
- **⋯ → Download lines (.ndjson)** saves the lines shown, one JSON entry per line, for a bug report.

`booth service` adds `pi` to the `systemd-journal` group, so `pi` and the apps PM2 runs as `pi` can read the whole journal without `sudo`. Without it, System is unavailable on the Logs page: run `sudo booth service`, then restart the booth so the admin picks up the group.

## Reading PM2 logs

PM2's daemon belongs to the service user, so ask it as `pi` from the repo:

```bash
cd /opt/dither-booth
bun run pm2:list                         # status, restarts, memory
bun run pm2:logs                         # all processes, live
bun run pm2:logs-app dither-booth-engine # one process
```

Or read the files directly. Each process writes **one file**, `logs/pm2/<process>.log`, holding both its stdout and its stderr. Each line is one JSON object:

```text
{"message":"[kiosk] {\"loggedAt\":\"2026-10-27T14:56:33.510Z\",\"level\":\"error\",…}\n","timestamp":"2026-10-27T14:56:33.512Z","type":"err","process_id":0,"app_name":"dither-booth-engine"}
```

| Field       | What                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `message`   | What the process printed, as PM2 received it: one or more lines, newline and all. See [Line format](#line-format) |
| `timestamp` | When PM2 received it, ISO time in UTC                                                                             |
| `type`      | `out` (stdout: info events) or `err` (stderr: warnings and errors)                                                |
| `app_name`  | The PM2 process name                                                                                              |

```bash
tail -f /opt/dither-booth/logs/pm2/dither-booth-engine.log
```

One entry is never split across two lines. A burst of output can arrive as one entry with several lines in its `message`. A long output line can be the other way round: cut across two entries in a row, the first `message` without its final newline. The Logs page joins them back.

Booths updated from an older release still have `<process>-out.log` and `<process>-err.log` next to the new files. PM2 no longer writes them and rotation leaves them alone; delete them once you no longer need them.

## Line format

Each log event is **one line** in `message`: the `[kiosk]` prefix, then the event as compact JSON.

```text
[kiosk] {"loggedAt":"2026-10-27T14:56:33.510Z","level":"error","source":"engine.device-setup","event":"wifi-join-failed","details":{"ssid":"BoothNet","password":"[redacted]"},"error":{"name":"Error","message":"Secrets were required","stack":"Error: Secrets were required\n    at …"}}
```

| Field      | What it holds                                                    |
| ---------- | ---------------------------------------------------------------- |
| `loggedAt` | When the app logged it, ISO time in UTC                          |
| `level`    | `info`, `warn` or `error`                                        |
| `source`   | The part of the app that logged it, e.g. `engine.printer`        |
| `event`    | The event name, e.g. `printer-status-changed`                    |
| `details`  | Optional. The event's details                                    |
| `error`    | Optional. `name`, `message`, `cause` and `stack` (one JSON line) |
| `origin`   | Only on [browser reports](#browser-reports): `"browser"`         |
| `deviceId` | Only on browser reports: the reporting iPad or phone             |
| `runId`    | Only on browser reports: which page load on that device (1, 2…)  |

Before a line is written:

- **Secrets are redacted.** A detail whose key contains the word `password`, `passphrase`, `psk`, `secret`, `token` or `pin` (any case, at any depth: `wifiPassword`, `darkroom_pin`, `accessToken`) shows `"[redacted]"`.
- **Odd values are made safe.** Big integers become strings, byte arrays (such as a printer's `raw` status packet) become arrays of numbers, and a reference back to a parent object becomes `"[circular]"`. If the details still can't be written, they become `"[unserializable: <reason>]"` and the event is kept.

Lines without the `[kiosk]` prefix are plain text from elsewhere: a crash trace, Bun or a library. Read those as they are. Events written before this format, in the old `-out.log` and `-err.log` files, spread one event over many lines, each with its own timestamp.

Pages in the browser (the Shutter and admin) log the same events as objects to the browser's console, not as JSON lines. Their warnings and errors also reach the server: see [Browser reports](#browser-reports).

### Grep recipes

In the file, the event sits inside the `message` string, so its quotes are escaped (`\"`). Search with `grep -F` and the escaped form. Each event is on one line, so `grep` always returns whole events:

```bash
cd /opt/dither-booth/logs/pm2
grep -F '\"level\":\"error\"' dither-booth-*.log | tail                        # recent errors, every process
grep -F '\"source\":\"engine.printer\"' dither-booth-engine.log | tail         # one part of the engine
grep -F '\"event\":\"printer-status-changed\"' dither-booth-engine.log | tail -5
tail -1 dither-booth-engine.log | jq -r .message                               # bare line, ready to paste (sudo apt install jq)
```

## Browser reports

The Shutter on the iPad and admin on staff phones send each **warning and error** they log to the server that served the page, which writes it to its own log. Info events stay in the browser's console.

- **What's sent.** Errors the page reports to staff, uncaught errors (`window-error`) and unhandled promise rejections (`unhandled-promise-rejection`), with their source, event, details and error. Secrets are redacted in the browser, before sending.
- **Where it lands.** Reports from the Shutter go to `dither-booth-shutter`'s log; reports from admin go to `dither-booth-admin`'s. Like any other warning or error, they are `"type":"err"` entries.
- **How to tell them apart.** A browser line carries `"origin":"browser"`, the reporting device's `deviceId`, and its `runId` (which page load on that device). The line's `loggedAt` is when the server received it.
- **Limits.** The server keeps at most **30 errors and 30 warnings a minute from one device** and drops the rest (warnings can't use up the errors' share), so a page stuck in an error loop can't fill the disk. A report over **16 KB** is sent without its details and with its stack cut to 4 KB; one still too big isn't sent.

```bash
cd /opt/dither-booth/logs/pm2
grep -F '\"origin\":\"browser\"' dither-booth-shutter.log | tail    # warnings and errors from the iPad
grep -F '\"deviceId\":\"<id>\"' dither-booth-admin.log | tail       # one phone
```

How the route checks reports: [Access control → Browser reports](/docs/architecture/access-control/#browser-reports).

## Rotation

logrotate rotates the three files, with the rule `booth service` installs at `/etc/logrotate.d/ditherbooth`:

- **When:** once a day, and also when a file is over **20 MB**, checked hourly. Raspberry Pi OS runs logrotate once a day (`logrotate.timer`); `booth service` makes it hourly with `/etc/systemd/system/logrotate.timer.d/ditherbooth.conf`, so a file passes 20 MB by at most an hour's output.
- **How many:** the last **7** rotated files per process, gzip-compressed (`dither-booth-engine.log.1.gz` … `.7.gz`). Older ones are deleted.
- **How:** copy, then truncate in place (`copytruncate`), as `pi`. PM2 keeps writing to the same file, with no restart. A line written during the copy can be lost.

Rotation works offline, with the Pi's own logrotate. `booth doctor` fails when the rule is missing, and warns when logrotate isn't hourly. To rotate now, for example on a full disk:

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

To follow one thing across a visit, grep by source: `grep -F '\"source\":\"engine.printer\"' dither-booth-engine.log`.

## Process restarts

PM2 restarts a process that crashes, with exponential backoff, up to 10 times in a row (a process must stay up 10 s to count as started). It also restarts a process that grows past its memory cap: **1 GB** for the engine (Chromium lives in it), **256 MB** for each web server.

A process that keeps restarting shows a high restart count in `bun run pm2:list`. Its log's last `"type":"err"` lines tell you why.

```bash
journalctl -u ditherbooth.service --since "1 hour ago"
```

shows whether the whole service restarted, for example because the network gave the booth a new address (that restart is expected: it re-issues the certificate).

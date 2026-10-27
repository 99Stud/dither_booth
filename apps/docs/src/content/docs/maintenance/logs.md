---
title: Logs
description: Where each part of the booth logs, and how to read it.
sidebar:
  order: 4
---

## Where logs go

| Source                                                    | Where                                                                                     | Read with                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| Engine, Shutter server, Admin server                      | PM2 log files in `/opt/dither-booth/logs/pm2/` (`<process>-out.log`, `<process>-err.log`) | `tail -f` or PM2, below                     |
| `ditherbooth.service` (start, stop, certificate re-issue) | journald                                                                                  | `journalctl -u ditherbooth.service`         |
| Network watch (booth Wi-Fi, mDNS name)                    | journald                                                                                  | `journalctl -u ditherbooth-network.service` |
| NetworkManager (Wi-Fi joins, failures)                    | journald                                                                                  | `journalctl -u NetworkManager`              |
| Kernel (USB plug/unplug, under-voltage)                   | journald                                                                                  | `journalctl -k` or `dmesg`                  |

The PM2 process names are `dither-booth-engine`, `dither-booth-shutter` and `dither-booth-admin`.

## Reading PM2 logs

PM2's daemon belongs to the service user, so ask it as `pi` from the repo:

```bash
cd /opt/dither-booth
bun run pm2:list                         # status, restarts, memory
bun run pm2:logs                         # all processes, live
bun run pm2:logs-app dither-booth-engine # one process
```

Or read the files directly:

```bash
tail -f /opt/dither-booth/logs/pm2/dither-booth-engine-out.log
```

Info events go to `-out.log`; warnings and errors go to `-err.log`.

## Line format

Each log event is **one line**: PM2's timestamp (`time: true` in `pm2.config.js`), the `[kiosk]` prefix, then the event as compact JSON.

```text
2026-10-27T14:56:33: [kiosk] {"loggedAt":"2026-10-27T14:56:33.510Z","level":"error","source":"engine.device-setup","event":"wifi-join-failed","details":{"ssid":"BoothNet","password":"[redacted]"},"error":{"name":"Error","message":"Secrets were required","stack":"Error: Secrets were required\n    at …"}}
```

| Field      | What it holds                                                    |
| ---------- | ---------------------------------------------------------------- |
| `loggedAt` | When the app logged it, ISO time in UTC                          |
| `level`    | `info`, `warn` or `error`                                        |
| `source`   | The part of the app that logged it, e.g. `engine.printer`        |
| `event`    | The event name, e.g. `printer-status-changed`                    |
| `details`  | Optional. The event's details                                    |
| `error`    | Optional. `name`, `message`, `cause` and `stack` (one JSON line) |

Before a line is written:

- **Secrets are redacted.** A detail whose key contains the word `password`, `passphrase`, `psk`, `secret`, `token` or `pin` (any case, at any depth: `wifiPassword`, `darkroom_pin`, `accessToken`) shows `"[redacted]"`.
- **Odd values are made safe.** Big integers become strings, byte arrays (such as a printer's `raw` status packet) become arrays of numbers, and a reference back to a parent object becomes `"[circular]"`. If the details still can't be written, they become `"[unserializable: <reason>]"` and the event is kept.

Lines without the `[kiosk]` prefix are plain text from elsewhere: a crash trace, Bun or a library. Read those as they are. Events written before this format spread one event over many lines, each with its own timestamp.

Pages in the browser (the Shutter and admin) log the same events as objects to the browser's console, not as JSON lines.

### Grep recipes

Each event is one line, so `grep` always returns whole events:

```bash
cd /opt/dither-booth/logs/pm2
grep '"level":"error"' dither-booth-*-err.log | tail                     # recent errors, every process
grep '"source":"engine.printer"' dither-booth-engine-*.log | tail        # one part of the engine
grep '"event":"printer-status-changed"' dither-booth-engine-out.log | tail -5
grep -h '\[kiosk\]' dither-booth-engine-out.log | sed 's/^.*\[kiosk\] //' | tail -1 # bare JSON, ready to paste
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

To follow one thing across a visit, grep by source: `grep '"source":"engine.printer"' dither-booth-engine-*.log`.

## Process restarts

PM2 restarts a process that crashes, with exponential backoff, up to 10 times in a row (a process must stay up 10 s to count as started). It also restarts a process that grows past its memory cap: **1 GB** for the engine (Chromium lives in it), **256 MB** for each web server.

A process that keeps restarting shows a high restart count in `bun run pm2:list`. Its `-err.log` tells you why.

```bash
journalctl -u ditherbooth.service --since "1 hour ago"
```

shows whether the whole service restarted, for example because the network gave the booth a new address (that restart is expected: it re-issues the certificate).

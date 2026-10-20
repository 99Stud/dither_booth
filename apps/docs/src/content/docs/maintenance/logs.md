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
grep '"error"' /opt/dither-booth/logs/pm2/dither-booth-engine-*.log | tail
```

Every line is timestamped (`time: true` in `pm2.config.js`).

## Log events

The apps log structured events: a level, a **source** and an **event name**, plus details. Search by event name.

| Source                | Events worth knowing                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine.server`       | `server-started`; `trpc-request-failed`, with the procedure path and error code                                                                                                                                                           |
| `engine.printer`      | `printer-status-changed` (with `conditions` and the `raw` packet), `printer-connected`, `printer-disconnected`, `printer-maintenance-entered`, `printer-maintenance-left`, `lottery-ticket-print-failed`, `receipt-print-dry-run-enabled` |
| `engine.kiosk`        | `kiosk-page-connected`, `kiosk-page-disconnected`, `kiosk-maintenance-changed`, `kiosk-reload-sent`, `camera-preview-started`                                                                                                             |
| `engine.device-setup` | `wifi-join-failed`, `setup-ticket-printed`                                                                                                                                                                                                |
| `engine.darkroom`     | `darkroom-unlocked`, `darkroom-unlock-refused`, `darkroom-pin-changed`                                                                                                                                                                    |
| `engine.browser`      | `browser-launch-failed`, `browser-close-failed` (the receipt Chromium)                                                                                                                                                                    |
| `engine.event`        | `event-kit-unknown`: an event names a kit this release doesn't ship; the default kit prints instead                                                                                                                                       |
| `engine.lottery`      | draw and lottery-ticket failures                                                                                                                                                                                                          |

To follow one thing across a visit, grep by source: `grep engine.printer …-out.log`.

## Process restarts

PM2 restarts a process that crashes, with exponential backoff, up to 10 times in a row (a process must stay up 10 s to count as started). It also restarts a process that grows past its memory cap: **1 GB** for the engine (Chromium lives in it), **256 MB** for each web server.

A process that keeps restarting shows a high restart count in `bun run pm2:list`. Its `-err.log` tells you why.

```bash
journalctl -u ditherbooth.service --since "1 hour ago"
```

shows whether the whole service restarted, for example because the network gave the booth a new address (that restart is expected: it re-issues the certificate).

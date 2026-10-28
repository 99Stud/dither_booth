---
title: "0008 — The admin server reads the Pi's metrics, without a library"
description: "The admin server samples /proc, /sys and vcgencmd every 5 s and serves an hour of history over one polled JSON route; no system-information library, no socket."
sidebar:
  order: 9
---

**The admin server, not the engine, reads the Pi's temperature, throttling, memory, CPU and disks itself from `/proc`, `/sys` and `vcgencmd`, keeps an hour, and serves it as JSON the admin polls every 5 s.**

Status: accepted, 2026-10-28

## Context

Staff checked the Pi over SSH (`vcgencmd get_throttled`, `free -h`, `df -h`). The two failures that take a booth down at a venue were invisible in admin until they happened: heat and a weak supply (throttling), and the engine's memory (PM2 restarts it past 1 GB). Both leave a trace the Pi can report: the firmware's since-boot flags, and a memory curve.

Three choices had to be made: who reads, with what, and how the page gets it.

## Decision

- **The admin server reads.** As with the Logs page ([ADR 0006](/docs/decisions/0006-json-line-logs/)): the engine is the process most likely to be down or thrashing when someone looks. The admin server already reads the host (PM2 files, the journal) and stays up.
- **No library.** `systeminformation` was the candidate: it reads temperature, memory, disks and load on Linux, but not the Pi's throttle flags nor the Pi 5's fan, which are the readings this booth needs, and it spawns many commands. Everything needed is a handful of files under `/proc` and `/sys` plus one `vcgencmd` call, behind an injected reader tested on fixture strings, as the network domain does with `nmcli`.
- **One polled JSON route, with the history on the server.** `GET /admin/system` returns the latest reading and the last 720 samples. The server samples on its own timer from start, so one reader serves every page and the charts are full when the page opens. The page polls every 5 s with TanStack Query, as the other admin cards do.
- **Thresholds in the shared utils**, one place for the page and the Health card: 70/80 °C, 15/5 % free, load against the cores.
- **Motion with anime.js**, already in the Shutter, at the same pinned version; one new shadcn primitive (`progress`).

### Not chosen

- **An engine `ops.*` procedure.** Fits the domain pattern, but the page would go blank exactly when the Pi is in trouble, and history would reset with each engine restart.
- **A WebSocket like the logs.** Push buys nothing at 5 s on a LAN, and costs a protocol, a hub and reconnection logic the Logs page needed for history paging and this page doesn't.
- **History in the browser.** It would reset on every reload and phone sleep, and every open tab would read the Pi.
- **NVMe SMART, per-process memory, network throughput.** SMART needs root; the others have a home elsewhere (PM2's limit, the Network card). Later, if needed.

## Consequences

- `vcgencmd` runs as `pi`, which needs the `video` group: a Raspberry Pi OS default, recorded in [Access control](/docs/architecture/access-control/#system-privileges). Without it the page says **Read on the booth** and the rest still works.
- Anyone who can load admin can read the Pi's model, uptime, heat, load and disk sizes: network-trusted, like the logs, and nothing from the data.
- The admin server reads six small files and runs one command every 5 s, whether or not a page is open: negligible on the Pi, and it means no page ever waits for a first read.
- A new reading means a new field in `system.protocol.tsx`, the reader, the page, and the [System](/docs/maintenance/system/) and [System metrics](/docs/architecture/system-metrics/) pages.

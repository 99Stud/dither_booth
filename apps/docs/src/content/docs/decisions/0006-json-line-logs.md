---
title: "0006 — One JSON line per log entry, rotated, read by the admin server"
description: "PM2 writes one combined JSON-line file per process, logrotate rotates it, and the admin server reads the files and the journal for the Logs page."
sidebar:
  order: 7
---

**Each app's output lands in one PM2 file per process, one JSON object per line. The system's logrotate rotates those files. The admin server, not the engine, reads them and the system journal to serve the admin's Logs page.**

Status: accepted, 2026-10-27

## Context

Diagnosing a booth meant SSH and `tail` on raw PM2 files ([spec, issue #95](https://github.com/99Stud/dither_booth/issues/95)):

- **Unreadable lines.** The shared logger printed each event as a pretty-printed object over many lines, with unquoted keys. No tool could tell where one event ended.
- **Split streams.** PM2 wrote each process's stdout and stderr to two files (`-out.log`, `-err.log`), each line prefixed with a local time (`time: true`). Putting one process's story back in order meant merging two files by a timestamp without a time zone.
- **No rotation.** Nothing rotated the files. They grew until the disk filled.
- **System logs need a shell.** Wi-Fi, USB and power events live in journald, which `pi` could only read with `sudo`.
- **A Logs page is coming.** It must keep working while the engine crashes or restarts, which is exactly when staff need it. Booths run offline.

## Decision

- **Line format.** The shared logger writes each server-side event as its `[kiosk]` prefix followed by compact JSON, one line per event.
- **PM2 files.** `pm2.config.js` sets `log_type: "json"` and one combined `log_file` per process, `logs/pm2/<process>.log`. `out_file` and `error_file` are `/dev/null`, so PM2 writes nothing else. `time: true` is gone: the envelope carries the timestamp. Each stdout or stderr chunk becomes one line, `{"message", "timestamp", "type": "out" | "err", "process_id", "app_name"}` (PM2 7.0.3, `lib/God/ForkMode.js`). Old `-out.log` and `-err.log` files stay where they are.
- **Rotation.** `booth service` installs `/etc/logrotate.d/ditherbooth`: the three files by name, daily, `maxsize 20M`, `rotate 7`, `compress`, `copytruncate`, as `pi`. Copy-and-truncate keeps PM2's open file handle valid, so rotation needs no PM2 signal or restart.
- **Journal access.** `booth service` adds `pi` to `systemd-journal`. The apps run as `pi`, so they can read the whole journal without root.
- **Who reads.** The admin server reads the PM2 files and the journal and serves them to the Logs page. It already controls PM2, and it stays up when the engine doesn't.
- **Checked.** `booth doctor` fails when the rotation rule is missing and warns when it is out of date or `pi` can't read the journal.

### Not chosen

- **pm2-logrotate.** A PM2 module installed from npm into the daemon. It needs the network at install time and adds a process inside PM2. logrotate ships with Raspberry Pi OS and runs offline.
- **Apps write their own files.** Every app would need its own rotation, and crashes that bypass the logger (an uncaught throw, Bun's own output) would be lost. PM2 captures everything a process prints.
- **Apps log to journald only.** PM2, not systemd, runs the apps, so journald would see PM2's output, not each process's. Staff and `grep` would lose the per-process files they know.
- **The engine serves logs.** The engine is the process most likely to be down when someone looks.

## Consequences

- `grep` and scripts find whole entries: one entry is one line. A chunk can still hold several lines or a partial one, so a reader splits `message` on newlines and joins a partial line with the next chunk.
- A line written during logrotate's copy can be lost. Logs are a diagnostic aid, not a record, so that's accepted.
- logrotate runs once a day on Raspberry Pi OS, so `maxsize 20M` only acts at that run: a file can grow past 20 MB within a day, but no longer grows without bound.
- A new PM2 process must be added to `PM2_PROCESS_NAMES` in the CLI, or its file isn't rotated.
- Membership of `systemd-journal` lets every app read the whole journal, which can hold other services' details. The admin server must filter what it serves, and restricting the Logs page to tech staff later stays one change at the admin's single access point.
- Rolling back is a config revert: the old two-file format comes back, and the old files were never touched.

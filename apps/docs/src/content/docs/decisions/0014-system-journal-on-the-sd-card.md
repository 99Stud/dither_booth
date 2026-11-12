---
title: "0014 — The system journal is kept on the SD card"
description: "Raspberry Pi OS keeps the journal in memory. The booth keeps it on the SD card, capped at 200 MB, so a boot that ends in a power cut can still be read."
sidebar:
  order: 15
---

**`booth service` makes journald keep the system journal on the SD card, up to 200 MB, with journald's own write timing. `booth doctor` warns when a booth still keeps it in memory.**

Status: accepted, 2026-11-12

## Context

At the 2026-10-31 event the Pi stopped several times with a steady red LED: powered, not running. The cause was the power supply ([#133](https://github.com/99Stud/dither_booth/issues/133)), but nothing on the booth could show it afterwards. Raspberry Pi OS ships `/usr/lib/systemd/journald.conf.d/40-rpi-volatile-storage.conf` with `Storage=volatile`, to spare the SD card: the journal lives in memory and a boot that ends in a cut leaves no kernel, NetworkManager or unit lines. Only the PM2 files on the SSD survived, and they showed boots that ended with no clean stop, not why.

[ADR 0006](/docs/decisions/0006-json-line-logs/) made the journal the home of the system's logs and gave the admin's Logs page access to it. It did not say where the journal is kept.

## Decision

- **On disk, capped.** `booth service` writes `/etc/systemd/journald.conf.d/ditherbooth.conf` with `Storage=persistent` and `SystemMaxUse=200M`. Its name sorts after the OS file, so it wins. journald then writes to `/var/log/journal`, on the SD card, and deletes its oldest entries past the cap.
- **Applied at once.** journald reads its settings at start only, so `booth service` restarts it and runs `journalctl --flush`, which moves what the running boot logged in memory onto the card. It does so whenever journald is not writing to disk, not only when the file changed: a run that wrote the file and then failed is finished by the next one.
- **journald's own timing.** journald writes to the card every 5 minutes, and at once after a line of critical priority or worse. The kernel logs the Pi's under-voltage warning at critical priority, so the lines that explain a weak supply, and everything logged before them, are on the card as soon as they happen.
- **Checked.** `booth doctor` warns when the settings file is missing or out of date, and when it is installed but journald still writes to memory.

### Not chosen

- **A shorter `SyncIntervalSec`** (30 s was tried). It adds writes to the card all day to save lines that are either written at once already (critical) or reach the card within about 30 s through the kernel's own write-back. Revisit if a cut ever leaves a boot whose last minutes are missing.
- **The journal on the SSD.** The SSD is mounted after journald starts and can be absent; the journal must not depend on it. The lines that matter most are the earliest of a boot.
- **Forwarding to a file with rsyslog.** A second copy of the same lines, with its own rotation to maintain, read by nothing.
- **Leaving it in memory and relying on the Hub.** The heartbeat reports that a booth went silent, not why, and a booth with no internet reports nothing.

## Consequences

- The SD card takes writes it didn't before: a few megabytes a day, bounded at 200 MB. The database and the PM2 logs stay on the SSD.
- `journalctl -b -1` and `journalctl --list-boots` work on a booth: [After a power cut](/docs/maintenance/logs/#after-a-power-cut). A boot whose last line is not a shutdown ended in a cut or a freeze.
- Up to 5 minutes of lines below critical priority can be missing before a cut that nothing announced.
- The admin's Logs page reads further back: its history is bounded by the 200 MB cap, across boots, not by the current boot.
- A booth gets this at its next `booth update`, whose setup step runs `booth service`.

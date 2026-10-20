---
title: "0001 — Persistent printer connection and ASB"
description: "Hold the printer's USB connection open and drive its status from Automatic Status Back."
sidebar:
  order: 2
---

**Hold the printer's USB connection open and drive its status from Automatic Status Back.**

Status: accepted, 2026-10-19

## Context

The engine used to open the TM-T20III for each receipt and close it afterwards, through `@node-escpos/core`. It never read anything back, so a printer out of paper or with its cover open was only discovered when a print failed: a half receipt, then a 20 s hang.

On 2026-10-19 we measured the booth's printer ([Printer watch spec](/docs/specs/printer-watchdog/)):

- Real-time status requests (`DLE EOT`) get no answer while the printer is offline, which is exactly when the cover is open or the paper is out.
- Automatic Status Back (`GS a`) pushes a status packet within a second of every change, offline included.
- Both need the IN endpoint read continuously, and `ESC @` (sent at every job) turns ASB off.

## Decision

The engine holds one libusb connection to the printer for as long as it runs:

- It keeps ASB on and reads the IN endpoint in a loop.
- It writes print jobs through the same handle, re-enabling ASB after each `ESC @`.
- It reconnects on its own when the printer is unplugged or switched off.

`@node-escpos` is gone. The few framing bytes it added are written directly, and a characterization test pinned them to its exact output before it was removed.

## Consequences

- The booth always knows the printer's state, can put itself in maintenance, and fails a print within about a second instead of 20 s.
- The engine owns the printer exclusively. Another process can't print or probe while it runs, and the kernel's `usblp` driver is detached until the engine stops.
- Cancelling a job means cancelling a libusb transfer mid-raster, which leaves the printer waiting for image bytes. The next job clears its buffer first (`DLE DC4 fn 8`), a step that per-job open/close never needed.
- The service user needs write access to the printer's USB node (the `lp` group on the booth).

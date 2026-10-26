---
title: "Printer watch"
description: "Spec and hardware findings for the printer watch: ASB measurements, state model, maintenance rules, acceptance criteria."
sidebar:
  order: 1
---

Status: implemented (#32) and running on the booth since 2026-10-19. Basis: measurements on the booth's own printer, listed in [Findings](#findings); behaviour on the booth, in [Checked on the booth](#checked-on-the-booth).

## As built: where it differs from the draft below

- **One subscription instead of two procedures.** `ops.watchPrinter` sends the full status first, then on every change. There's no `printer.getStatus`, because the subscription's first message replaces it.
- **Two event streams instead of one `PrinterStatusEvent`.** The printer's `subscribe` reports status changes. Maintenance entering and leaving is logged separately, as `printer-maintenance-entered` / `printer-maintenance-left`. A status change can't say whether it moved maintenance, because maintenance follows 3–10 s later.
- **The buffer is cleared after an aborted job.** The printer may still be waiting for the rest of a cut-off `GS v 0`. The next job therefore starts with `DLE DC4 fn 8` (clear buffers) before `ESC @`. Whether the TM-T20III honours it is still a hardware check (see [Open questions](#open-questions)).
- **The kill switch lives in memory and also relaxes the print gate.** Automatic maintenance defaults to on in production and off in development. It isn't stored, because main has no settings table and the kits PR holds the next migrations. Turned off, printing only refuses a printer that isn't connected, so a misbehaving sensor can't block guests.
- **The kiosk `maintenance` command is unchanged,** and guests see the usual "be right back". Printer-specific guest copy waits for kit copy (PR #30).
- **Dry run is a preview printer.** `RECEIPT_PRINT_DRY_RUN` swaps in a printer with the same interface that never opens USB and reports ready, instead of a printer with no transport whose state stays `unknown`. Maintenance still never triggers, and it saves raster tickets as PNGs.
- **A few rules the draft didn't settle:**
  - The first status the printer reports after a restart applies at once, so a cover left open never lets a guest in.
  - A printer that stays silent gets `GS a` again, up to 3 times.
  - `stop()` gives up on `GS a 0` after 500 ms, so shutdown can't hang.

The engine watches the receipt printer continuously. It shows the printer's live state in the admin panel, and it puts the booth in maintenance on its own when the printer can't print (paper out, cover open, unplugged). Once the problem is fixed, it takes the booth out of maintenance again.

Notifications (telling staff on their phone, for example) come in a **separate PR**. This PR only has to emit the events that the notification work will consume; see [Events for the notification PR](#events-for-the-notification-pr).

## Why

Today the engine finds out the printer is in trouble only when a print fails. A roll that runs out mid-event leaves a guest with half a receipt, a job that hangs until `PRINTER_FLUSH_TIMEOUT_MS` (20 s), and a queue that can print the next guest's receipt on the wrong person's turn. Staff learn about it from the guests. The existing healthz check only scans the USB bus (`healthz.printer.ts`), so it reports "healthy" with the cover open or no paper.

## Findings

These were measured on 2026-10-19 on the booth Pi (Raspberry Pi 5, Raspberry Pi OS Trixie, kernel 6.18) with the booth's TM-T20III. Each point is marked **observed** (seen on the hardware), **inferred** (deduced, not seen directly) or **unknown**.

### The device

| Fact                                                                                                         | Evidence         |
| ------------------------------------------------------------------------------------------------------------ | ---------------- |
| USB `04b8:0e28`, "EPSON TM-T20III", full speed (12 Mb/s)                                                     | observed (sysfs) |
| One interface: class 7 (printer), subclass 1, protocol 2 (bidirectional)                                     | observed (sysfs) |
| Bulk OUT `0x01` and bulk IN `0x82`, 64-byte packets                                                          | observed (sysfs) |
| IEEE 1284 ID `MFG:EPSON;CMD:ESC/POS;MDL:TM-T20III;CLS:PRINTER;…`                                             | observed (usblp) |
| The kernel `usblp` driver binds it as `/dev/usb/lp0` at boot                                                 | observed         |
| `/dev/bus/usb/…` and `/dev/usb/lp0` are `root:lp`, so the service user needs the `lp` group (or a udev rule) | observed         |
| Opening it through libusb detaches `usblp`, which stays detached until a replug or reboot                    | observed         |

### Reading from the printer: zero-length packets first

**Observed:** a read on the IN endpoint with nothing waiting completes at once with a **zero-length packet**. A real reply arrives 5–20 ms after the request, so the first one or more reads after a request return nothing.

Any reader must treat an empty read as "nothing yet" and keep polling until a deadline. Treating it as "no reply" (or as EOF through `usblp`) is why our first probes showed nothing.

### Real-time status (`DLE EOT n`): not usable to detect faults

- **Observed:** while the printer is online, `DLE EOT 1/2/4` (`10 04 n`) is answered within about 20 ms with one byte that has the fixed bit pattern `(b & 0x93) == 0x12`. The values when everything is fine: n1 = `0x16`, n2 = `0x12`, n4 = `0x12`.
- **Observed:** while the printer is **offline** (cover open), requests get **no answer**. When it comes back online, a few of the queued requests are answered all at once, and they report the online state (`0x12`). Over 29 s offline, with a request every 3 s, three replies arrived, all at the moment the printer came back.
- **Inferred:** the printer processes real-time commands only when online. This may be a printer setting ("real-time commands" can be disabled on TM printers) or firmware behaviour; we haven't checked the setting.

**So polling can't see the states we care about** (cover open, paper out), because those are exactly the states in which the printer stops answering.

### Automatic Status Back (`GS a n`): the mechanism to use

**Observed:** after `GS a 0xFF` (`1d 61 ff`), the printer:

- sends one 4-byte status packet immediately (the current state),
- sends a new packet **within the same second as each change**, including while offline,
- keeps doing so until it's reset (`ESC @`), switched off, or sent `GS a 0`.

Packets recorded while staff opened the cover, held Feed and removed and replaced the roll:

| Packet        | What was happening               | Decoded                          |
| ------------- | -------------------------------- | -------------------------------- |
| `14 00 00 0f` | idle, paper loaded, cover closed | OK                               |
| `3c 00 00 0f` | cover open                       | offline + cover open             |
| `5c 00 00 0f` | Feed button held                 | offline + feed button            |
| `1c 00 0c 0f` | roll removed, cover closed       | offline + paper out              |
| `3c 00 0c 0f` | roll removed, cover open         | offline + cover open + paper out |

**Explained:** we haven't seen a **paper near-end** packet because the TM-T20III ships with near-end detection **off**. Per the [TM-T20III Technical Reference Guide](https://files.support.epson.com/pdf/pos/bulk/tm-t20iii_trg_en_reva.pdf) (rev. A, p. 27, 43):

- Near-end detection is a memory switch, **Disabled (default setting)**. Until it's enabled, the sensor reports nothing and the Paper LED only lights at paper end.
- It's enabled in Software Setting Mode (Feed-button menu, Customize Value **9: Near-end Detection**, p. 54) or with the Epson TM-T20III Utility.
- The detection lever has two positions, set by a screw under the roll: **lower (default) trips at about 23 mm** of roll outer diameter left, **upper at about 27 mm**. Epson recommends cores of 12 mm inner / 18 mm outer diameter for accurate detection, and says it can't be exact.
- It only works with the printer **horizontal**; vertical or wall-mounted, it must stay off.
- Near-end isn't in the guide's list of conditions that take the printer offline (p. 15): it lights the Paper LED and keeps printing. Epson's ESC/POS reference adds that it stops printing only if `ESC c 4` selects the near-end sensor, which the engine never sends.

Per Epson's command reference, ASB reports it as byte 3 bits 0–1 = `11`.

**Decision (2026-10-20):** the booth's printer is installed **vertically** (paper exit at the front, toward the guest), where Epson requires near-end detection to stay off. It stays off; the parser and the `paper-near-end` condition stay in place for a horizontally mounted printer, unverified on hardware.

**Observed later, on the running booth:** byte 2 bit 3 (`0x08`, auto-cutter error) set together with cover open and/or paper out (`3c08000f`, `1c08000f`, `3c080c0f`, `1c080c0f`). The watch reports it as `error`. We haven't seen the unrecoverable or auto-recoverable error bits.

**Unknown:** the paper-out packets all arrived within one second, at the moment the cover closed after the roll change. We can't tell whether the sensor reads paper only once the cover is closed, or whether the packets were held back. Either way, the state was correct once the cover closed.

### `ESC @` resets ASB

**Inferred, from Epson's command reference:** `ESC @` (initialize) turns ASB off. The engine sends `ESC @` at the start of every job (`PRINTER_INITIALIZE_COMMAND`), so it must send `GS a` again after each initialize, or the watchdog goes silent after the first print.

### Epson's own driver doesn't read status

We inspected Epson's macOS filter (`rastertotmtr` from the `com.epson.pkg.TMPrinter` 3.0.1 package) with REA. It imports no CUPS back-channel functions and contains no `DLE EOT`, `GS a` or `GS r` sequences. It only sends `ESC @`, the drawer pulse and `ESC c 3 0`. There's no vendor method to copy; ASB is the documented way.

## ASB packet format

Every packet is 4 bytes. The first byte always has `(b1 & 0x93) == 0x10`, which tells it apart from a `DLE EOT` reply (`(b & 0x93) == 0x12`). The bits below are the ones we use. The "Seen" column says whether we've seen the bit change on the printer.

| Byte | Bit(s)       | Meaning when set                            | Seen                              |
| ---- | ------------ | ------------------------------------------- | --------------------------------- |
| 1    | 3 (`0x08`)   | offline                                     | yes                               |
| 1    | 5 (`0x20`)   | cover open                                  | yes                               |
| 1    | 6 (`0x40`)   | Feed button pressed                         | yes                               |
| 1    | 2 (`0x04`)   | drawer connector pin 3                      | yes; always set, ignore it        |
| 2    | 3 (`0x08`)   | auto-cutter error                           | yes, with cover open or paper out |
| 2    | 5 (`0x20`)   | unrecoverable error                         | no                                |
| 2    | 6 (`0x40`)   | auto-recoverable error (e.g. head overheat) | no                                |
| 3    | 0–1 (`0x03`) | paper near end                              | no                                |
| 3    | 2–3 (`0x0c`) | paper out                                   | yes                               |
| 4    | all          | reserved (`0x0f` seen)                      | ignore                            |

A packet can be split across two USB reads, or two packets can arrive in one read. The parser has to buffer bytes and cut packets on the first-byte pattern.

## Scope of this PR

1. **Watchdog.** The engine holds the printer connection open, keeps ASB on, and tracks a live printer state.
2. **Admin.** The Control Center shows the printer's live state and recent changes.
3. **Automatic maintenance.** A printer fault puts the booth in maintenance, and clearing the fault takes it out, without overriding maintenance that staff switched on by hand.
4. **Print gate.** The engine refuses a print when the printer can't print, instead of hanging.
5. **Events.** Every state change becomes an event that the notification PR can subscribe to.

Not in this PR: notifications, a software paper counter (millimetres fed per roll), `booth doctor` checks, the kiosk-screen work.

## Printer state model

```ts
type PrinterCondition =
  | "ok"
  | "paper-near-end" // can still print: a warning, not a fault
  | "paper-out"
  | "cover-open"
  | "error" // cutter, unrecoverable or auto-recoverable error bits
  | "disconnected" // not on USB, or the connection failed
  | "unknown"; // connected, but no ASB packet yet

type PrinterStatus = {
  conditions: PrinterCondition[]; // e.g. ["cover-open", "paper-out"]
  canPrint: boolean; // false for paper-out, cover-open, error, disconnected, unknown
  offline: boolean; // ASB byte 1 bit 3, as reported
  raw: string | null; // last packet as hex, for the admin panel and the logs
  changedAt: string; // ISO time of the last change in conditions
  checkedAt: string; // ISO time of the last packet or reconnect attempt
};
```

- The Feed button is **not** a condition. It makes the printer briefly offline and must not trigger maintenance. We log it, and that's all.
- A packet whose conditions match the current ones only updates `checkedAt`, not `changedAt`.

## Design

### Engine: one long-lived printer connection

The printer domain (`apps/engine/src/domains/printer`) owns a `PrinterConnection` created at engine start, replacing the per-job open/close in `printer.utils.ts`.

- **Connect:** find `04b8:0e28`, open it, detach `usblp` if bound, claim interface 0, then send `GS a 0xFF`. The first packet sets the initial state, so after an engine restart the state is known within a second.
- **Read loop:** read the IN endpoint continuously. Empty reads are normal (zero-length packets); wait ~20 ms after each one. Feed the bytes to the ASB parser, which updates the state and emits a change event.
- **Write jobs:** print jobs keep going through `runExclusivePrinterJob` and are written to the OUT endpoint **on the same handle**. Each job sends `ESC @`, then `GS a 0xFF` straight after, then the raster, feed and cut. The handle stays open after the job.
- **Disconnect and reconnect:** on a USB detach event or any transfer error, set `disconnected`, close the handle, and retry with backoff (1 s up to 10 s). Use the `usb` library's attach/detach events to reconnect quickly when the cable comes back.
- **Shutdown:** send `GS a 0`, release the interface, and close. This replaces `closePrinterUSBAdapter` in `server-app.ts`.
- `RECEIPT_PRINT_DRY_RUN` keeps skipping all USB work. The state stays `unknown`, and dry-run never triggers maintenance.

**Decision: stop using `@node-escpos/core`'s `Printer` for jobs.** Its `close()` flushes by closing the USB device, which fights a persistent connection. The engine already builds the raster bytes itself; the rest is centre-align (`ESC a 1`), feed and cut (`GS V`), which are a few constant bytes. Writing them directly removes a layer, at the cost of maintaining those bytes ourselves. Keep `@node-escpos/usb-adapter` only if it still helps with device discovery; otherwise use `usb` directly.

### Print gate

- Before writing a job, if `canPrint` is false, fail fast with a typed error (`PRINTER_UNAVAILABLE`, including the conditions). The shutter shows its print-error screen rather than waiting for the flush timeout.
- If the state turns `paper-out`, `cover-open` or `error` **while a job is being written**, abort the job at once with the same error, instead of waiting 20 s.
- **Unknown:** what the printer does with the rest of an interrupted raster after the paper is replaced: does it resume or discard it? Find out on hardware before deciding whether to send `ESC @` (or a buffer clear) on recovery. Until then, treat an interrupted receipt as lost and let the existing retry path reprint it.

### Automatic maintenance

Today maintenance is one stored switch (`kiosk.maintenance.ts`, a single SQLite row) set from admin and pushed to the kiosk pages by the `maintenance` command. The booth screen switches only once the guest is back on the landing screen, so a visit in progress isn't cut off.

Change: maintenance has **reasons**, and the booth is in maintenance when any reason is active.

| Reason    | Set by                                                   | Stored                                                           |
| --------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| `manual`  | staff, from admin (today's switch)                       | SQLite, as today                                                 |
| `printer` | the watchdog, while `canPrint` is false (after debounce) | not stored: rebuilt from the printer's first ASB packet at start |

- **Entering:** `paper-out`, `cover-open` and `error` set the `printer` reason after **3 s** in that state. That's long enough to ignore a cover opened and shut straight away, and short enough to catch the next guest. `disconnected` waits **10 s**, which covers an engine restart or a quick replug.
- **Leaving:** the `printer` reason clears once `canPrint` has been true for **3 s**. It never clears `manual`: if staff put the booth in maintenance, fixing the printer doesn't reopen it.
- **`paper-near-end`** never sets maintenance. It's a warning in admin, and later a notification.
- **Kiosk command:** keep `{ type: "maintenance", enabled }` and add `reasons: ("manual" | "printer")[]`, so the shutter can show printer-specific copy ("Changing the paper, back in a moment") when the only reason is `printer`. The shutter keeps its rule of switching only on the landing screen.
- **Admin switch:** the Booth screen card shows both reasons. Turning maintenance off by hand clears `manual` only. If `printer` is active, the card says so and the booth stays closed until the printer is fixed.
- **Kill switch:** an admin setting to turn automatic maintenance off (stored like the other booth settings), for a sensor that misbehaves during an event. It's on by default.

### Admin panel

In the Control Center, a **Printer** card (or a section of the Health card):

- The live condition with a clear label and colour (OK, paper low, paper out, cover open, error, disconnected), plus how long it has been in that state.
- Whether printing is possible, and whether the watchdog currently holds the booth in maintenance.
- The last 20 changes with times (kept in memory, so they're lost on restart; that's fine for a live view).
- The raw last packet in a details row, for debugging.

The data comes from a `printer.getStatus` query and a `printer.onStatus` subscription, following the existing kiosk and camera subscription patterns. Both are behind `opsProcedure`.

### Healthz

`checkPrinterHealthz` reports the watchdog state instead of only scanning the bus: `ok` when `canPrint`, unhealthy with the conditions otherwise, and `paper-near-end` as healthy with a warning. `booth doctor` and the admin Health card pick this up without changes of their own.

### Events for the notification PR

The watchdog exposes an in-process subscription, `printerWatchdog.subscribe(listener)`, and also logs each change with `logKioskEvent` (`printer-status-changed`). The notification PR consumes this; nothing in this PR sends anything off the booth.

```ts
type PrinterStatusEvent = {
  type: "printer-status-changed";
  at: string; // ISO time
  previous: PrinterCondition[];
  current: PrinterCondition[];
  canPrint: boolean;
  maintenance: { entered: boolean; left: boolean }; // whether this change moved the printer reason
};
```

## Checked on the booth

The engine's own logs on the booth (`engine.printer`, 2026-10-19 → 2026-10-20, engine at `20b6b16`) show the watch working on the real printer:

| Criterion                             | Seen in the logs                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Start with the printer OK          | `[]` (`1400000f`) on every connect, no maintenance                                                                          |
| 2, 5. Cover open, paper out, and back | `cover-open` (`3c00000f`), `paper-out` (`1c000c0f`), both (`3c000c0f`), then `[]`                                           |
| 2. Maintenance follows the printer    | `printer-maintenance-left` 3 s after the printer reported `[]`                                                              |
| 8. Unplugged, and back                | `disconnected`, `printer-maintenance-entered` 10 s later; `printer-connected`, `unknown` → `[]`, maintenance left 3 s later |
| 10. State stays live after prints     | Status changes keep arriving after setup tickets printed (`setup-ticket-printed` ×19)                                       |

Not applicable: paper near-end (criterion 13), off on our vertically mounted printer, see [Findings](#automatic-status-back-gs-a-n-the-mechanism-to-use). Still open: and a job aborted mid-print (criterion 11) — no aborted job appears in the logs, so the buffer clear after an interrupted raster is unverified.

## Acceptance criteria

1. Engine start with the printer connected and OK: admin shows **OK** within 2 s, and the booth isn't in maintenance.
2. Open the cover while idle: admin shows **cover open** within 1 s, and the booth enters maintenance after about 3 s. Close it: admin shows **OK** at once, and maintenance ends after about 3 s.
3. Open and shut the cover in under 3 s: no maintenance.
4. Hold Feed: no maintenance; admin may briefly show offline.
5. Remove the roll and close the cover: **paper out**, then maintenance. Reload the roll: OK, then maintenance ends.
6. Staff turn maintenance on by hand, then open and close the cover: maintenance stays on after the cover closes.
7. Paper out while the booth is in printer maintenance, then staff toggle maintenance off by hand: the booth stays closed, and admin explains why.
8. Unplug the printer USB cable: **disconnected**, maintenance after about 10 s. Plug it back in: OK within a few seconds, maintenance ends.
9. Restart the engine with the cover open: the booth comes back up already in printer maintenance.
10. Print several receipts in a row: the state stays live after each one, which proves `GS a` is re-sent after `ESC @`.
11. Paper runs out mid-receipt: the job fails within about 1 s with `PRINTER_UNAVAILABLE`, not after 20 s.
12. `RECEIPT_PRINT_DRY_RUN=true`: no USB access, state `unknown`, never maintenance.
13. **Hardware only, horizontal printers only (not our booth):** enable near-end detection on the printer (memory switch, off by default), run a roll to near-end and confirm the **paper low** packet and its bits. Update [ASB packet format](#asb-packet-format) with the result.

Unit tests cover the ASB parser (split packets, concatenated packets, DLE EOT bytes mixed in), the state transitions with debounce (fake timers), the maintenance reason rules (1, 2, 3, 6, 7), and the print gate.

## Open questions

- **Near-end trip point:** how much paper is left when it trips on our 80 × 80 mm rolls? It can only be measured.
- **Interrupted raster:** after paper-out mid-print, does the printer resume or discard? This decides whether recovery sends a buffer clear (see [Print gate](#print-gate)).
- **Real-time command setting:** is the `DLE EOT` behaviour a setting we could change? It doesn't block this design, since ASB doesn't depend on it.
- **USB permissions in production:** the service user currently gets access through the `lp` group, added by hand on the booth. `booth install` should set it up (udev rule or group); that's tracked separately in the CLI hardening work.

## Reproducing the measurements

The probes ran on the booth Pi as `pi` (in the `lp` group), with Bun and the repo's `usb@2.17.0`. They aren't in the repo yet. Minimal loop:

```ts
const device = findByIds(0x04b8, 0x0e28)!;
device.open();
const iface = device.interface(0);
if (iface.isKernelDriverActive()) iface.detachKernelDriver();
iface.claim();
const out = iface.endpoint(0x01) as OutEndpoint;
const inp = iface.endpoint(0x82) as InEndpoint;

await out.transferAsync(Buffer.from([0x1d, 0x61, 0xff])); // GS a 0xFF: ASB on
inp.timeout = 200;
for (;;) {
  const bytes = await inp.transferAsync(64).catch(() => undefined);
  if (!bytes?.length) {
    await Bun.sleep(20); // zero-length packet: nothing yet
    continue;
  }
  console.log(new Date().toISOString(), bytes.toString("hex"));
}
```

Send `GS a 0` (`1d 61 00`) and release the interface before exiting. Don't run a probe while the engine is printing: only one process can claim the interface.

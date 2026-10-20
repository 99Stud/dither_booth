---
title: Paper and printer
description: Paper capacity, roll changes, what the booth does when the printer can't print, and printer care.
sidebar:
  order: 2
---

## Paper

The booth uses 80 mm thermal rolls, **80 mm across, on a 12.7 mm core** (the TM-T20III takes 79.5 ± 0.5 mm width and rolls up to 83 mm across). A roll this size holds about **70–80 m**.

A photo receipt is about 1,400 dots long, around 175 mm with feed and cut, so:

|                         | Estimate                                      |
| ----------------------- | --------------------------------------------- |
| Photo receipts per roll | **350–400**, fewer when lottery tickets print |
| A pack of 20 rolls      | ~7,000 photo receipts                         |

Count the receipts from the first full roll at a real event and replace these estimates with your number.

When a roll is nearly finished, a **red stripe** appears on the paper. The printer's sensors don't see it; it's a reminder for staff to have the next roll ready. The printer's own **paper low** sensor shows in admin as a warning, and the printer keeps printing.

### Paper low (near-end sensor): off on our booth

The TM-T20III has a near-end sensor, a lever resting on the roll, but **the booth doesn't use it**: Epson's guide says it only works with the printer **horizontal** (paper exit on top, toward the ceiling) and must stay disabled when the printer stands **vertically** (paper exit at the front) or hangs on a wall, or it misfires. Our booth's printer stands vertically, with the paper coming out toward the guest. Near-end detection is also off by default on this printer, so there's nothing to change.

So admin never shows **Paper low** on our booth. The **red stripe** is the only low-paper cue; out of paper and cover open are still detected and close the booth.

If a booth ever mounts its printer horizontally, near-end can be enabled once per printer:

1. Printer off. Hold **Feed** and switch it on: the self-test prints. Then hold **Feed** for at least 1 second: the mode menu prints.
2. Press **Feed** briefly 3 times, then hold it 1 second: _Software setting mode (Customized Value Settings)_.
3. Press **Feed** briefly 9 times, then hold it 1 second: **9: Near-end Detection**. Select **Enabled** the same way (short presses for its number, then hold).
4. Switch the printer off and on.

It then trips at about **23 mm** of roll diameter left with the lever in its default (lower) position, **27 mm** in the upper one — roughly a dozen photo receipts, or twice that, on our rolls (estimated from the roll geometry). It only lights the Paper LED and warns in admin; printing continues until the paper end sensor stops it.

## Changing a roll

1. Open the cover. The booth goes into **maintenance** about **3 seconds** later: guests see “be right back”. If a receipt was printing, the job stops within a second; the iPad retries twice, 2 seconds apart, and if the printer still can't print, that visit ends without its receipt. Change rolls between guests when you can.
2. Drop the new roll in following the diagram inside the cover, pull a few centimetres past the cutter.
3. Close the cover. The booth reopens about **3 seconds** after the printer reports it's ready.

You don't need to touch admin. If staff had switched maintenance on by hand, it stays on.

## What the booth does when the printer can't print

The engine watches the printer continuously (the **printer watch**). The printer pushes a status packet within a second of every change: cover, paper, errors.

| Printer condition                                   | Can print | Effect                                                                              |
| --------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| Ready                                               | yes       | —                                                                                   |
| **Paper low**                                       | yes       | Warning in admin. Never on our booth: near-end detection is off (vertical printer). |
| **Out of paper**, **cover open**, **printer error** | no        | Maintenance after **3 s** in that state.                                            |
| **Not connected** (unplugged, switched off)         | no        | Maintenance after **10 s**, which covers a quick replug or restart.                 |
| **Checking** (no status yet, just after start)      | no        | Maintenance after 10 s if it never reports.                                         |

- **Before** a visit spends anything, the engine checks the printer. A booth out of paper never burns a lottery prize.
- **During** a print, a printer that stops being able to print aborts the job within about a second instead of hanging for 20 seconds.
- Holding the **Feed** button briefly makes the printer report itself offline. It never triggers maintenance.
- After an engine restart, the first status applies at once: a booth restarted with the cover open comes back up already in maintenance.

To stop the printer from closing the booth (a sensor misbehaving mid-event), turn **Automatic** off in admin's Booth screen card. The booth then only refuses to print when the printer isn't connected at all. Turn it back on afterwards.

How it works and why: [Printer and printer watch](/docs/architecture/printer/).

## Printer care

- **Print density.** Some thick rolls print faint. If dithered photos look washed out, raise the printer's print density before touching the dither settings.
- **Print head.** Vertical white lines mean a dirty head. With the printer off and cool, wipe the head with an isopropyl alcohol pen and let it dry.
- **Cutter.** Paper dust builds up around the cutter. Blow it out between events.
- **Self-test.** With the printer off, hold **Feed** and switch it on: it prints its settings page. Useful to tell a printer problem from a booth problem.
- **Exclusive access.** While the engine runs, it holds the printer's USB connection. No other program on the Pi can print or probe it, and the kernel's `usblp` driver stays detached until the engine stops.

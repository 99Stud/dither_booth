---
title: A guest visit, end to end
description: From the Start tap to the cut receipt — the Experience state machine, the two-phase print, dithering and the raster.
sidebar:
  order: 2
---

A visit is split into **prepare** and **print**. Preparing commits the lottery draw and renders both receipts while the guest watches the slot machine; printing happens once the reels stop. The guest never waits for a render after the animation, and the animation always shows the real outcome.

## Sequence

```mermaid
sequenceDiagram
  autonumber
  participant G as Guest
  participant S as Shutter (iPad)
  participant E as Engine
  participant C as Chromium /receipt-viewer
  participant P as Printer

  G->>S: Tap Start
  S->>E: booth.startVisit()
  E-->>S: { visitId }
  Note over S: countdown → smile → capture
  S->>E: booth.prepareReceipt(FormData: photo, visitId)
  E->>E: printer can print? (else PRECONDITION_FAILED)
  E->>E: dither photo to 576 px, threshold
  E->>C: lay out photo receipt (event kit, ticket items, ref)
  C-->>E: screenshot
  E->>E: lottery draw + link the visit (transaction)
  E->>C: lay out lottery ticket (if win, or loser tickets on)
  C-->>E: screenshot
  E->>E: rasters → GS v 0, keep job 120 s
  E-->>S: { draw, hasLottery, ticketRef, visitId }
  Note over S: slot machine lands on draw outcome
  S->>E: booth.printPreparedReceipt(ticketRef)
  E->>P: photo receipt
  E->>P: lottery ticket
  E-->>S: ok
  S->>E: booth.endVisit(visitId, completed)
  Note over S: receipt ready → reset
```

## The Experience state machine

The Shutter's guest flow is a reducer (`apps/shutter/src/app/Experience/internal/Experience.machine.tsx`) with explicit phases:

`idle → introExiting → countdown → smile → capturing → preparing → spinning → slotResult → instructions → printing → cameraExiting → receiptReady → resetting… → idle`

- **Countdown.** It starts the moment the shutter has opened (`SHUTTER_MS`, 620 ms), at 3, one number a second, then 1 s on the smile caption before the capture. The caption fades in alongside the first number rather than before it, so the guest never looks at an open camera with nothing counting.
- **Lottery on or off.** The stage is laid out at capture, before the draw, so `startRequested` carries a first guess, `hasLottery`, from `booth.getLotteryStatus` (refetched at every `idle` and on `lottery-updated`; unknown counts as off). The engine has the last word: `prepareReceipt` returns `hasLottery`, true when the draw ran against a lottery (the event's while it is on, or a forced prize). `receiptPrepared` keeps `hasLottery` if either says so, so a prize is always revealed on the reels and reels already showing never vanish (they land on the loss). Without a lottery, `receiptPrepared` goes straight from `preparing` to `printing`, skipping `spinning`, `slotResult` and `instructions`: 5.2 s shorter (2.2 s of reels stopping, `SLOT_STAGE_ENTER_MS` 500 ms then three reels 400 ms apart taking 900 ms each, plus the 1.5 s result hold and the 1.5 s claim hold). The claim hold is short because the claim stays on screen while the ticket prints. The slot panel never mounts, the frozen photo stays full size in the live feed's square instead of shrinking to the left, and every caption sits inside that square. The draw captions (`prompts.feelingLucky`, `prompts.thatsIt`) are replaced by `prompts.printing`. If the engine's draw turns the lottery on, the photo shrinks to the left and the reels slide in at `spinning`, as on a normal lottery visit. The landing screen hides its lottery panel whenever the status isn't `enabled`.

- **Phase flags** (`Experience.phases.tsx`) declare what each phase shows and allows: camera visible, start enabled, print attempt running… The map is an exhaustive `Record<ExperiencePhase, …>`, so a new phase doesn't compile until its behaviour is decided.
- **Start needs a camera.** **Start** is disabled outside `startEnabled`, during maintenance, and while the camera isn't `ready` (no picture yet, or reopening). See [The camera on the page](/docs/architecture/kiosk-channel/#the-camera-on-the-page).
- **Animation fallbacks.** Each animated transition has a timer fallback, so a missed `animationend` event can't freeze the flow.
- **Print attempts** carry an id. A late `printSucceeded` or `printFailed` from an earlier attempt is ignored.
- **The visit** is recorded on the engine (see [Visits](#visits) below). The machine keeps `visitId` and `visitEnd`; `startRequested` clears both.
- Kiosk commands (reload when idle, maintenance, open the Darkroom) wait for `idle`, so a visit is never cut off. They apply after 90 s anyway, because a stuck flow never gets back to idle.

## Prepare: `booth.prepareReceipt`

`booth.prepareReceipt` and `booth.printPreparedReceipt` each make one call into the engine's tickets module (`createTickets`, in `apps/engine/src/domains/receipt`). The same module prints test prints and sample lottery tickets and renders the Darkroom's preview. It draws every ticket through a ticket renderer: the receipt viewer page in Chromium on the booth, a fake in the tests.

The photo is sent as FormData, not JSON: `photo`, and `visitId` when the iPad has one.

1. **Printer gate.** The tickets module refuses with `PRECONDITION_FAILED` if the printer can't print — **before the draw**, so a booth out of paper never burns a prize. With automatic maintenance off, only a disconnected printer is refused.
2. **Dither.** The photo is rotated, resized to the printer's **576 dots** (80 mm at 203 dpi) and dithered with the booth's print configuration (see [Print settings](/docs/reference/print-settings/)), then thresholded to pure black/white.
3. **Lay out.** The headless Chromium page, which stays open on the Shutter's `/receipt-viewer`, renders the event's **kit** with the dithered photo, the ticket items and the ticket ref, and the engine screenshots it. Before it navigates, the page fetches the kit's added fonts and the partner logos. Before the screenshot the engine waits for the photo to decode and for every other image on the ticket to load: each `<img>` (a partner logo) and each CSS image (a kit's mask or background), because they are fetched when the ticket first renders. An image that won't load is left off and logged (`receipt-image-failed`): the guest still gets a print. One page serves every job, one at a time (the renderer's page queue); the screenshot is capped at 12 s.
4. **Draw.** `executeLotteryDraw` runs inside one SQLite transaction: cooldown read, weighted pick among prizes with stock, insert of the `draw` row (which is what takes the unit of stock). The draw's visit is linked in the same transaction, so a draw always has its visit. A ticket-ref collision retries with a new ref, and the photo receipt is re-rendered with the ref that was actually recorded.
5. **Lottery ticket.** Rendered for a win, or for a loss when the lottery prints loser tickets.
6. **Raster.** Each screenshot becomes an ESC/POS `GS v 0` raster command. With `print_config.upside_down` on (the default), the 1-bit image is turned 180° before packing: the printer feeds the top of the ticket out first, so turned, it reads the right way up for the guest holding it. Doing it in the image rather than with the printer's `ESC {` keeps it independent of how the printer treats raster graphics in upside-down mode, and before the real-time byte escape, which has to see the final bytes.
7. **Store.** The job is kept in memory for **120 s**, keyed by ticket ref, and the draw is returned to the iPad with `hasLottery`, whether it ran against a lottery, and the `visitId` it was linked to.

## Print: `booth.printPreparedReceipt`

1. The printer gate runs again.
2. The job is **taken out** of the store while printing, so a double submit can't print twice.
3. The photo receipt prints, and the job remembers it did (`photoPrinted`). Then the lottery ticket.
4. On failure the job is **put back**. The iPad retries up to **2 times, 2 s apart**, and a retry prints only what didn't come out: never a second photo.
5. The whole printing phase has a **45 s** budget on the iPad. Past it, or after the retries, the visit resets.

A `NOT_FOUND` (job expired after 120 s, or never prepared) isn't retried.

Each print that runs counts one `print_attempts` on the visit; the one that prints in full sets `printed_at`.

## Visits

The engine records every guest's **visit** in the `visit` table, through the visits module (`createVisits`, in `apps/engine/src/domains/visit`). Visits feed the Event page's tiles, and later the Hub's analytics. Recording never gets in a guest's way: each step logs its failure (`engine.visit`) and the visit goes on.

| Step               | Who                                                                        | Writes                                                   |
| ------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| `booth.startVisit` | the iPad, when the intro leaves after **Start**                            | a new visit, after closing the one left open             |
| capture            | `prepareReceipt`, inside the draw's transaction                            | `captured_at`, `draw_id`, the event the draw ran against |
| print              | `printPreparedReceipt`, on success and on failure                          | `print_attempts + 1`; `printed_at` on success            |
| `booth.endVisit`   | the iPad: `completed` once printed, `failed` after the final `printFailed` | `ended_at`, `end_reason`. Only the first end counts.     |

- **At most one open visit.** There is one kiosk, so starting a visit, or a draw that comes without one, first closes the visit left open: `completed` if its receipt printed, otherwise `abandoned`. It ends at its last known step (print, capture or start), not when it was noticed. A page reload mid-visit is closed this way at the next **Start**.
- **Every visit ends.** At engine start, every visit still open is closed the same way (`visits-closed-at-boot`).
- **A draw without a visit joins the one Start just opened.** If `startVisit` hadn't answered yet (or failed), `prepareReceipt` comes without `visitId`, or with one that already drew. The draw then joins the open visit that hasn't drawn, if it started less than **2 min** ago (Start to the photo takes about 10 s), and returns its id, which the iPad keeps. Otherwise it starts its own visit. A `visitId` that can't be one (empty, or over 64 characters) is dropped the same way: it never stops the guest.
- **A draw joins its visit even once that visit ended.** The iPad may give up on the print (45 s) before the draw answers, ending the visit `failed`; the late draw still belongs to it, so the guest counts once.
- **Printed in full means completed.** A visit whose tickets printed in full ends `completed`, whatever the iPad said or in which order: the iPad may give up on a print that still comes out, and a restart may close a visit whose print follows.
- **No guest data.** A visit holds times, its draw and how it ended. No photo, nothing about the guest.

## Print jobs on the wire

All jobs go through one long-lived USB connection, one at a time (the booth printer's own queue). A job is:

1. `DLE DC4 fn 8` — clear buffers, **only after a job was aborted**, since the printer may still be waiting for the rest of a cut-off raster.
2. `ESC @` — initialise.
3. `GS a 0xFF` — re-enable Automatic Status Back, which `ESC @` turned off.
4. `ESC a 1` centre, the `GS v 0` raster, line feeds, `GS V` cut.

If the printer reports it can't print while a job is being written, the job is aborted within about a second with `PRINTER_UNAVAILABLE`. A job the printer doesn't take within 20 s is abandoned as stalled. Details in [Printer and printer watch](/docs/architecture/printer/).

## Test prints and dry run

- **Test prints** (`config.printReceipt`, from the Darkroom) use the same render path with the sample ref `000000` and **never draw**.
- **Sample lottery tickets** (`config.printSampleLotteryTicket`, from the Darkroom and admin's **Settings → Printing**) render a win for a chosen prize, or a loss, under the same ref, without touching the lottery.
- **The Darkroom's preview** (`config.generateReceipt`) renders the photo receipt the right way up, without a ticket number, and never touches the printer. Like a visit, it waits for the receipt viewer page after a Puppeteer restart.
- **`RECEIPT_PRINT_DRY_RUN=true`** (development only) puts the preview printer in place of the USB one. Visits, test prints and sample lottery tickets take the same path, and the printer saves each raster as a PNG in `tmp/receipt-previews/` and opens it instead of printing. See [Developing without a printer](/docs/development/without-a-printer/).

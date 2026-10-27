---
title: Engine API
description: Every tRPC procedure the engine exposes, by group, with its access level.
sidebar:
  order: 3
---

The engine's API is tRPC (`apps/engine/src/internal/router.ts`). Browsers call it at `/engine/trpc` on the Shutter or Admin origin. Access levels are explained in [Access control](/docs/architecture/access-control/).

**Access**: **any** = any origin · **admin** = admin origin · **darkroom** = admin origin or a Darkroom token · **setup** = setup server token.

## `booth.*` — the kiosk

| Procedure               | Kind                | Access | Purpose                                                                                                            |
| ----------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| `getLotteryStatus`      | query               | any    | Whether the active event's lottery is on                                                                           |
| `getLogoAsset`          | query               | any    | A logo on the booth, as its black and white PNG (base64)                                                           |
| `startVisit`            | mutation            | any    | Start pressed: record a visit; returns `{ visitId }` (null if not recorded)                                        |
| `prepareReceipt`        | mutation (FormData) | any    | Draw and render both receipts for `photo`, linked to `visitId`; returns `{ draw, hasLottery, ticketRef, visitId }` |
| `printPreparedReceipt`  | mutation            | any    | Print a prepared job by `ticketRef`; prints only the parts not yet out                                             |
| `endVisit`              | mutation            | any    | `{ visitId, reason }`: `completed`, `abandoned` or `failed`; first end counts                                      |
| `onKioskCommand`        | subscription        | any    | The kiosk command stream for one page                                                                              |
| `reportKioskStatus`     | mutation            | any    | A page reports its camera and maintenance screen state                                                             |
| `sendKioskCameraSignal` | mutation            | any    | WebRTC signalling from the kiosk page                                                                              |
| `unlockDarkroom`        | mutation            | any    | Trade the PIN for a Darkroom token                                                                                 |
| `lockDarkroom`          | mutation            | any    | End the caller's Darkroom session                                                                                  |

## `config.*` — authoring and tuning

| Procedure                                     | Kind     | Access   | Purpose                                                                      |
| --------------------------------------------- | -------- | -------- | ---------------------------------------------------------------------------- |
| `getCurrentEvent`                             | query    | darkroom | Active event with its lottery and prizes, or `null`                          |
| `createEvent`                                 | mutation | admin    | Create event + lottery; rejects if one is active                             |
| `updateEvent`                                 | mutation | admin    | Rename, change kit                                                           |
| `replaceEvent`                                | mutation | admin    | Archive the active event and create the next one, atomically                 |
| `updateLotterySettings`                       | mutation | admin    | Live, no-win weight, pause after a win, loser tickets                        |
| `updateTicketItems`                           | mutation | admin    | Item names printed on the receipt                                            |
| `uploadLogo`                                  | mutation | admin    | Add a PNG or SVG logo (FormData, up to 2 MB), kept as it prints              |
| `listLogoAssets`                              | query    | admin    | Logos on the booth                                                           |
| `deleteLogoAsset`                             | mutation | admin    | Remove a logo; refused while the active event prints it                      |
| `createPrize` / `updatePrize` / `deletePrize` | mutation | admin    | Prize CRUD                                                                   |
| `restockPrize`                                | mutation | admin    | `+N` / `−N` stock, idempotent by `adjustmentId`                              |
| `listDraws`                                   | query    | admin    | The active event's draws; by ticket number, any visit                        |
| `getVisitStats`                               | query    | admin    | The active event's visits, completed, prints, wins, average visit, or `null` |
| `getPrintConfiguration`                       | query    | darkroom | Print tuning                                                                 |
| `updatePrintConfiguration`                    | mutation | darkroom | Print tuning, and admin's ticket orientation                                 |
| `dither`                                      | mutation | darkroom | Dither a photo with given settings, for the preview                          |
| `generateReceipt`                             | mutation | darkroom | Render a receipt preview                                                     |
| `printReceipt`                                | mutation | darkroom | Test print under ref `000000`; never draws                                   |
| `printSampleLotteryTicket`                    | mutation | darkroom | Print a sample win (for a prize) or loss ticket                              |
| `getDarkroomPinStatus`                        | query    | admin    | Whether a PIN is set                                                         |
| `setDarkroomPin`                              | mutation | admin    | Set the PIN; revokes all tokens                                              |
| `getDeviceSetup`                              | query    | darkroom | Setup links and QR data                                                      |
| `printSetupTicket`                            | mutation | darkroom | Print a setup ticket now                                                     |
| `getNetworkStatus`                            | query    | darkroom | Current connection, saved and nearby networks                                |
| `saveWifiNetwork`                             | mutation | darkroom | Save a network, optionally join it now                                       |
| `forgetWifiNetwork`                           | mutation | darkroom | Delete a saved network                                                       |
| `setBoothWifi`                                | mutation | darkroom | Run on the booth Wi-Fi, or go back to saved networks                         |

## `ops.*` — control and recovery

| Procedure                       | Kind         | Access   | Purpose                                                                  |
| ------------------------------- | ------------ | -------- | ------------------------------------------------------------------------ |
| `getHealthz`                    | query        | darkroom | Health of engine, Shutter (with kiosk pages), camera, printer, Puppeteer |
| `restartPuppeteerReceiptViewer` | mutation     | admin    | Relaunch the receipt Chromium                                            |
| `reloadKiosk`                   | mutation     | admin    | Reload kiosk pages, `when-idle` or `now`                                 |
| `showKioskScreen`               | mutation     | admin    | Switch the iPad to the Experience or the Darkroom                        |
| `setKioskMaintenance`           | mutation     | admin    | Manual maintenance on/off                                                |
| `setAutomaticMaintenance`       | mutation     | admin    | Let the printer close and reopen the booth                               |
| `watchPrinter`                  | subscription | admin    | Printer status, then every change                                        |
| `watchCamera`                   | subscription | admin    | A camera live-view session                                               |
| `sendCameraSignal`              | mutation     | admin    | WebRTC signalling from the viewer                                        |

Admin also restarts PM2 processes through its own server (not the engine), which only works when the apps run under PM2.

## `captive.*` — the captive page

| Procedure          | Kind     | Access | Purpose                                                                          |
| ------------------ | -------- | ------ | -------------------------------------------------------------------------------- |
| `getCaptiveStatus` | query    | setup  | `pick-network`, `booth-wifi-chosen` or `not-on-booth-wifi`, with nearby networks |
| `joinFromCaptive`  | mutation | setup  | Join a network; refused unless `pick-network`                                    |

## Errors

| Code                  | Typical cause                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `FORBIDDEN`           | Wrong origin, missing or expired Darkroom token, missing setup token                                       |
| `PRECONDITION_FAILED` | Printer can't print (`PrinterUnavailableError`, with its conditions)                                       |
| `NOT_FOUND`           | No prepared receipt for that ref (expired after 120 s), no print configuration                             |
| `TOO_MANY_REQUESTS`   | Darkroom unlock locked out after 5 wrong PINs                                                              |
| `CONFLICT`            | `restockPrize` with an `adjustmentId` reused for a different change; creating an event while one is active |
| `BAD_REQUEST`         | Input validation; the error's `data.zodError` carries the field errors                                     |

## Adding a procedure

1. Put it in its domain: `apps/engine/src/domains/<domain>/{queries,mutations,subscriptions}/<name>.ts`, one procedure per file, exported from the domain's `index.ts`.
2. Build it on the base procedure of **whoever calls it** (`boothProcedure`, `configProcedure`, `opsProcedure`, `darkroomProcedure`, `captiveProcedure`).
3. Validate input with zod. Non-JSON payloads (photos, uploads) take FormData (`z.instanceof(FormData)`) or raw bytes (`octetInputParser`).
4. Register it in `router.ts` under its group, and add it to `router.test.ts`'s access checks.
5. Add it to this page.

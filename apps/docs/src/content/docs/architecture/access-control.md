---
title: Access control
description: Who can call what — the four tRPC base procedures, the Darkroom PIN and tokens, and the setup server token.
sidebar:
  order: 7
---

The booth is on networks it doesn't control: venue Wi-Fi, guests on the booth Wi-Fi. The engine assumes **any device on the network can send requests**, and decides per procedure.

Code: `apps/engine/src/internal/trpc.ts`. `apps/engine/src/internal/router.test.ts` checks every procedure both ways.

## The router

The router is split by caller, and each group is built on one base procedure that carries its access check:

| Group / base                                  | Access                                    | Used for                                                                                                                                                       |
| --------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booth.*` — `boothProcedure`                  | **Any origin**                            | What the kiosk needs during a visit: start and end the visit, prepare and print, lottery status, the kiosk stream, camera signalling, unlock/lock the Darkroom |
| `config.*` — `configProcedure`                | **Admin origin only**                     | Event, lottery and prize authoring, draws, the Darkroom PIN                                                                                                    |
| `ops.*` — `opsProcedure`                      | **Admin origin only**                     | Recovery and control: reload, maintenance, booth screen, restarts, printer watch, camera live view                                                             |
| `darkroomProcedure` (in `config.*` / `ops.*`) | Admin origin **or** a live Darkroom token | Print tuning and the checks around it, Wi-Fi, device setup, health                                                                                             |
| `captive.*` — `captiveProcedure`              | **Setup server token** only               | The captive page's status and join                                                                                                                             |

A new procedure goes in the group of whoever calls it, on that group's base. The full list is in [Engine API](/docs/reference/engine-api/).

## Admin origin

“Admin origin” means the request's `Origin` header is the admin app's own origin, on one of the booth's hostnames or its IP (from the TLS manifest). Browsers set `Origin` themselves; a page served from elsewhere can't claim to be admin.

That makes admin **network-trusted**: anyone who can load `https://<booth>:3002` can use it. Keep the booth on networks you're comfortable with, or on its own Wi-Fi, whose password is printed only on tickets staff keep.

## Darkroom PIN and tokens

The Darkroom runs on the **kiosk origin** (the Shutter), which guests use too, so it needs its own secret.

- **The PIN** (4–8 digits) is set in admin (`config.setDarkroomPin`, admin only). Only its **argon2id** hash is stored, in the singleton `darkroom_access` table. No PIN: the Darkroom stays locked.
- **`booth.unlockDarkroom({ pin })`** returns `{ token, expiresAt }`. Tokens live **in memory**:
  - a token expires **30 minutes** after its last use;
  - a new PIN, or an engine restart, revokes every token;
  - after **5 wrong PINs** in a row, unlocking answers `TOO_MANY_REQUESTS` for **60 s**;
  - `booth.lockDarkroom` ends the caller's session.
- The token travels in the **`x-darkroom-token`** header. The Darkroom keeps it in `sessionStorage`: it survives a reload, not a closed tab.

A token opens only `darkroomProcedure` calls:

| Area              | Procedures                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Print tuning      | `config.getPrintConfiguration`, `updatePrintConfiguration`, `dither`, `generateReceipt`, `printReceipt`                 |
| Sample tickets    | `config.printSampleLotteryTicket`, `config.getCurrentEvent` (for the prize list)                                        |
| Network and setup | `config.getNetworkStatus`, `saveWifiNetwork`, `forgetWifiNetwork`, `setBoothWifi`, `getDeviceSetup`, `printSetupTicket` |
| Status            | `ops.getHealthz`                                                                                                        |

Everything else in `config.*` and `ops.*` — including setting the PIN — stays admin-only.

## Setup server token

The captive page must work for a device that trusts nothing and has no PIN, yet a guest on the booth Wi-Fi must not be able to move the booth. So:

- At start, the engine writes a random token to `.local/runtime/setup-server-token`, **owner-only**. Only the setup server (in the Shutter process, same user) reads it.
- The setup server sends it as **`x-setup-server-token`** with `captive.*` calls. A browser, even one on the booth, can't read the file.
- The setup server only serves the captive page to clients on the booth Wi-Fi's subnet.
- The engine refuses `captive.joinFromCaptive` unless the booth opened its Wi-Fi **for want of a network**. While staff run the event on the booth Wi-Fi, the captive page is gone and joining is refused.

## Browser reports

Both web servers (Shutter on 3000, Admin on 3002) take **`POST /client-log`**: the browser logger's warnings and errors, sent with `navigator.sendBeacon`. It is the only route a browser can write to without going through the engine, so it is **write-only** and refuses before it logs anything:

| Check                                                                                                                       | Refused with |
| --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Not `POST`                                                                                                                  | 405          |
| `Origin` isn't the server's own origin, on one of the booth's hostnames or its IP                                           | 403          |
| Body over **16 KB** (read no further than that)                                                                             | 413          |
| Not a valid report (zod: `level` `warn` or `error`, `deviceId`, `runId`, `source`, `event`, optional `details` and `error`) | 400          |
| More than **30 reports a minute** of one level (`warn` or `error`) from the same `deviceId`                                 | 429          |

An accepted report answers 204 and is re-logged once through the shared logger, marked `"origin":"browser"` with its `deviceId` and `runId`. The server's logger redacts secrets again. Nothing is ever read back through this route.

Why these numbers: a report is one event, a few KB with its stack; 16 KB leaves room and bounds what one request can write. A page stuck in an error loop on one device stops at 30 lines a minute instead of filling the disk. Warnings and errors have separate budgets of 30 each, so a chatty warning loop can't get real errors refused. The limit is per device and level, in memory, and resets with the server; a device that forges ids can still only write 16 KB a request, from an allowed origin.

Code: `packages/browser-server/src/internal/client-log.routes.ts`; the report schema and limits are in `packages/logging/src/isomorphic/client-log.ts`.

## Engine exposure

The engine binds **`127.0.0.1:3001`**. Nothing outside the Pi reaches it except through the two web servers' `/engine/trpc` proxies, which forward the browser's headers (so the engine sees the real `Origin`) and its abort signal.

## System privileges

| Actor                       | Runs as     | Can                                                                                    |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| PM2 and the three apps      | `pi`        | Its files, the printer (`lp` group), NetworkManager actions allowed by the polkit rule |
| Network watch               | root        | Bring the booth Wi-Fi up/down, nftables redirect, restart avahi                        |
| `booth install` and friends | root (sudo) | Provisioning                                                                           |

The polkit rule grants the service user four NetworkManager actions and nothing wider: modify system connections, network control, Wi-Fi scan, Wi-Fi sharing.

## Logs socket

The admin's Logs page reads every service's logs over **`wss://<booth>:3002/admin/logs`** ([Logging](/docs/architecture/logging/)). Like the rest of admin it is **network-trusted**: the upgrade only checks that `Origin` is the admin's own origin, on one of the booth's hostnames or its IP, and refuses others with 403. Anyone who can load admin can read the logs.

- **Read-only.** The socket only answers history requests and streams lines; nothing a page sends reaches a file or a process.
- **Secrets.** Lines carry what the logger wrote, which redacted secret-looking detail keys first ([Logs → Line format](/docs/maintenance/logs/#line-format)).
- **System journal.** Only the booth's units, NetworkManager and the kernel are read; the rest of the journal stays on the booth. Those lines are shown as journald stored them, not redacted ([Logging → The system journal](/docs/architecture/logging/#the-system-journal)).
- **One way in.** `createLogsRoute` in `apps/admin/src/lib/logs/logs.routes.tsx` is the only place logs leave the booth. Restricting them to tech staff later is one change there (its `validateUpgrade` hook), plus the page.
- **The page** (`/logs`) is an ordinary admin route, linked from the sidebar, Settings and the health items. It holds nothing itself: without the socket it shows no lines.

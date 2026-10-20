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

| Group / base                                  | Access                                    | Used for                                                                                                                              |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `booth.*` — `boothProcedure`                  | **Any origin**                            | What the kiosk needs during a visit: prepare and print, lottery status, the kiosk stream, camera signalling, unlock/lock the Darkroom |
| `config.*` — `configProcedure`                | **Admin origin only**                     | Event, lottery and prize authoring, draws, the Darkroom PIN                                                                           |
| `ops.*` — `opsProcedure`                      | **Admin origin only**                     | Recovery and control: reload, maintenance, booth screen, restarts, printer watch, camera live view                                    |
| `darkroomProcedure` (in `config.*` / `ops.*`) | Admin origin **or** a live Darkroom token | Print tuning and the checks around it, Wi-Fi, device setup, health                                                                    |
| `captive.*` — `captiveProcedure`              | **Setup server token** only               | The captive page's status and join                                                                                                    |

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

## Engine exposure

The engine binds **`127.0.0.1:3001`**. Nothing outside the Pi reaches it except through the two web servers' `/engine/trpc` proxies, which forward the browser's headers (so the engine sees the real `Origin`) and its abort signal.

## System privileges

| Actor                       | Runs as     | Can                                                                                    |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| PM2 and the three apps      | `pi`        | Its files, the printer (`lp` group), NetworkManager actions allowed by the polkit rule |
| Network watch               | root        | Bring the booth Wi-Fi up/down, nftables redirect, restart avahi                        |
| `booth install` and friends | root (sudo) | Provisioning                                                                           |

The polkit rule grants the service user four NetworkManager actions and nothing wider: modify system connections, network control, Wi-Fi scan, Wi-Fi sharing.

---
title: URLs, ports and environment
description: Every address the booth answers on, and every environment variable the apps read.
sidebar:
  order: 2
---

## URLs

| What             | URL                                                  | Notes                                                                                                                                                                |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shutter (guests) | `https://<hostname>.local:3000`, `https://<ip>:3000` | `.local` survives venue changes                                                                                                                                      |
| Darkroom         | `https://<hostname>.local:3000/darkroom`             | PIN required                                                                                                                                                         |
| Admin            | `https://<hostname>.local:3002`, `https://<ip>:3002` | Staff PIN required. Admin origin plus its session authorise `config.*` / `ops.*`                                                                                     |
| Admin session    | `https://<hostname>.local:3002/admin/session`        | POST `{pin}` signs in (sets the `dither_staff` HttpOnly cookie), DELETE signs out. [Session cookie](/docs/architecture/access-control/#the-session-cookie)           |
| Setup page       | `http://<ip>:3003`, `http://<hostname>.local:3003`   | Plain HTTP: before a device trusts the booth                                                                                                                         |
| Captive page     | `http://10.42.0.1/wifi`                              | Booth Wi-Fi only, while it waits for a network. Joining asks for the staff PIN                                                                                       |
| Receipt viewer   | `https://<…>:3000/receipt-viewer`                    | For the engine's Chromium only                                                                                                                                       |
| Docs (this site) | `https://<hostname>.local:3002/docs/`                | Served by the admin server from `apps/docs/dist`, offline                                                                                                            |
| Engine           | `http://127.0.0.1:3001`                              | Loopback only. Browsers use `/engine/trpc` on the Shutter or Admin origin                                                                                            |
| Health           | `/healthz` on each of the above ports                | JSON, with `release`, the one the server runs. The engine's adds `busy`: why a restart now would land on a guest, or null; `booth update` reads it before its switch |
| Browser reports  | `POST /client-log` on 3000 and 3002                  | Write-only. [Browser reports](/docs/architecture/access-control/#browser-reports)                                                                                    |
| Logs page        | `https://<hostname>.local:3002/logs`                 | Filters in the URL: `services`, `levels`, `source`, `q`. [Open Logs](/docs/maintenance/logs/#open-logs)                                                              |
| Logs socket      | `wss://<hostname>.local:3002/admin/logs`             | The Logs page's live logs. [Logging](/docs/architecture/logging/)                                                                                                    |
| System page      | `https://<hostname>.local:3002/system`               | The Pi's heat, throttling, memory, CPU and storage. [System](/docs/maintenance/system/)                                                                              |
| System readings  | `GET https://<hostname>.local:3002/admin/system`     | JSON: the latest reading and the last hour. [System metrics](/docs/architecture/system-metrics/)                                                                     |
| Updates          | `https://<hostname>.local:3002/admin/update`         | GET the snapshot; POST check, install, roll back. Booth only. [Updates](/docs/architecture/updates/#from-admin)                                                      |
| Power            | `POST https://<hostname>.local:3002/admin/power`     | Restart the apps, reboot, power off. Booth only. [Power](/docs/architecture/access-control/#power)                                                                   |

On the booth Wi-Fi, the booth is always `10.42.0.1`.

## Ports

| Port      | Process                | Protocol | Bind             | Env            |
| --------- | ---------------------- | -------- | ---------------- | -------------- |
| 3000      | Shutter                | HTTPS    | `::`             | `SHUTTER_PORT` |
| 3001      | Engine                 | HTTP     | `127.0.0.1`      | `ENGINE_PORT`  |
| 3002      | Admin                  | HTTPS    | `::`             | `ADMIN_PORT`   |
| 3003      | Shutter (setup server) | HTTP     | all              | `SETUP_PORT`   |
| 80 → 3003 | nftables redirect      | HTTP     | `10.42.0.1` only | —              |

Defaults live in `packages/ports/src/internal/ports.constants.ts`. Each app has a `.env.example` with the variables it reads. Most setups keep the defaults; if you change a port, change it for every app that reads it.

## Environment variables

### Apps

| Variable          | Read by                | Default | Purpose                                                                                                                      |
| ----------------- | ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `SHUTTER_PORT`    | shutter, engine, admin | `3000`  | Shutter HTTPS port                                                                                                           |
| `ENGINE_PORT`     | engine, shutter, admin | `3001`  | Engine port (and the proxies' upstream)                                                                                      |
| `ADMIN_PORT`      | admin, engine          | `3002`  | Admin HTTPS port                                                                                                             |
| `SETUP_PORT`      | shutter, engine, CLI   | `3003`  | Setup page port                                                                                                              |
| `NODE_ENV`        | all                    | —       | `production` on the booth (development-only flags refuse it); `development` under `bun run dev`, which logs readable entries |
| `PROCESS_MANAGER` | all                    | —       | `pm2` under PM2, `turborepo` under `bun run dev`. Admin's restart actions only work under PM2                                |

### Development only

These must not be set with `NODE_ENV=production`.

| Variable                          | Purpose                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `RECEIPT_PRINT_DRY_RUN=true`      | Use the preview printer instead of USB: save each raster ticket as a PNG in `tmp/receipt-previews/` and open it; log text tickets |
| `LOTTERY_FORCE_OUTCOME=win\|loss` | Force the draw's outcome                                                                                                          |
| `LOTTERY_FORCE_PRIZE_ID=<id>`     | Force that prize (implies a win). Required with `LOTTERY_FORCE_OUTCOME=win`                                                       |
| `HUB_URL`, `HUB_PUBLISHABLE_KEY`  | Register with another Hub than production, such as the local stack (`supabase status`). Set both or neither                       |

Rules and examples: [Developing without a printer](/docs/development/without-a-printer/).

### URL flags

| Flag     | On      | Purpose                                                                                                                                                  |
| -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `?debug` | Shutter | Shows the three.js inspector over the background, with its raw values. For development: it also works on the booth, so never leave it in the kiosk's URL |

### CLI

See [booth CLI → Environment](/docs/reference/cli/#environment).

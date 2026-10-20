---
title: URLs, ports and environment
description: Every address the booth answers on, and every environment variable the apps read.
sidebar:
  order: 2
---

## URLs

| What             | URL                                                  | Notes                                                                     |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Shutter (guests) | `https://<hostname>.local:3000`, `https://<ip>:3000` | `.local` survives venue changes                                           |
| Darkroom         | `https://<hostname>.local:3000/darkroom`             | PIN required                                                              |
| Admin            | `https://<hostname>.local:3002`, `https://<ip>:3002` | Admin origin is what authorises `config.*` / `ops.*`                      |
| Setup page       | `http://<ip>:3003`, `http://<hostname>.local:3003`   | Plain HTTP: before a device trusts the booth                              |
| Captive page     | `http://10.42.0.1/captive`                           | Booth Wi-Fi only, while it waits for a network                            |
| Receipt viewer   | `https://<…>:3000/receipt-viewer`                    | For the engine's Chromium only                                            |
| Docs (this site) | `https://<hostname>.local:3002/docs/`                | Served by the admin server from `apps/docs/dist`, offline                 |
| Engine           | `http://127.0.0.1:3001`                              | Loopback only. Browsers use `/engine/trpc` on the Shutter or Admin origin |
| Health           | `/healthz` on each of the above ports                | JSON                                                                      |

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

| Variable          | Read by                | Default | Purpose                                                                                       |
| ----------------- | ---------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `SHUTTER_PORT`    | shutter, engine, admin | `3000`  | Shutter HTTPS port                                                                            |
| `ENGINE_PORT`     | engine, shutter, admin | `3001`  | Engine port (and the proxies' upstream)                                                       |
| `ADMIN_PORT`      | admin, engine          | `3002`  | Admin HTTPS port                                                                              |
| `SETUP_PORT`      | shutter, engine, CLI   | `3003`  | Setup page port                                                                               |
| `NODE_ENV`        | all                    | —       | `production` on the booth. Development-only flags refuse to run under it                      |
| `PROCESS_MANAGER` | all                    | —       | `pm2` under PM2, `turborepo` under `bun run dev`. Admin's restart actions only work under PM2 |

### Development only

These must not be set with `NODE_ENV=production`.

| Variable                          | Purpose                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `RECEIPT_PRINT_DRY_RUN=true`      | Skip the USB printer; write photo and lottery rasters as PNGs to `tmp/receipt-previews/` and open them |
| `LOTTERY_FORCE_OUTCOME=win\|loss` | Force the draw's outcome                                                                               |
| `LOTTERY_FORCE_PRIZE_ID=<id>`     | Force that prize (implies a win). Required with `LOTTERY_FORCE_OUTCOME=win`                            |

Rules and examples: [Developing without a printer](/docs/development/without-a-printer/).

### CLI

See [booth CLI → Environment](/docs/reference/cli/#environment).

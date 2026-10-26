---
title: Developing without a printer
description: Dry-run printing, forced lottery outcomes and the seeded dev event.
sidebar:
  order: 2
---

These flags are read from the engine's environment and **refuse to run with `NODE_ENV=production`**.

## Dry run

```bash
RECEIPT_PRINT_DRY_RUN=true bun run dev
```

- No USB access at all: the engine uses the preview printer, which is always ready. Visits, test prints and sample lottery tickets go through the same checks as on a booth, and maintenance never triggers.
- Set in `apps/engine/.env`, it can't be turned off from the command line as is: Turbo runs tasks in strict env mode and drops variables `turbo.json` doesn't declare, so the file wins. For one run, `RECEIPT_PRINT_DRY_RUN=false bun run dev --env-mode=loose`.
- Receipts still go through the whole pipeline — Chromium must load the Shutter's `/receipt-viewer`, so the Shutter must be running.
- Each raster ticket is written as a PNG to `apps/engine/tmp/receipt-previews/` (`ticket-<time>-<n>.png`) and opened: for a visit, the photo receipt, then the lottery ticket. They are the bytes the printer would get, so with **Settings → Printing → Bottom first** (the default) they open turned 180°.
- Setup and Wi-Fi tickets are text, not rasters: they are only logged (`printer-dry-run-text-ticket`).

## Forcing the lottery

| Variable                            | Effect                           |
| ----------------------------------- | -------------------------------- |
| `LOTTERY_FORCE_OUTCOME=win\|loss`   | Force the outcome                |
| `LOTTERY_FORCE_PRIZE_ID=<prize id>` | Force that prize (implies a win) |

Rules:

- `LOTTERY_FORCE_PRIZE_ID` alone forces a win for that prize.
- `LOTTERY_FORCE_OUTCOME=win` requires `LOTTERY_FORCE_PRIZE_ID`.
- `LOTTERY_FORCE_OUTCOME=loss` can't be combined with `LOTTERY_FORCE_PRIZE_ID`.
- A forced win bypasses cooldown, weights and `enabled`, but **still takes a unit of stock** and inserts a `draw` row. A forced prize that's out of stock (or removed) makes the draw fail.

## Seeded dev event

```bash
bun run --filter @dither-booth/engine db:seed:lottery            # once
bun run --filter @dither-booth/engine db:seed:lottery -- --reset # wipe events, draws, prizes, lotteries and reseed
```

It creates an active event and an enabled lottery with three prizes, archiving any other active event. Stable ids:

| Id                    | Role                        |
| --------------------- | --------------------------- |
| `dev_campaign`        | Event                       |
| `dev_lottery`         | Lottery                     |
| `dev_prize_common`    | Prize, common, 100 in stock |
| `dev_prize_rare`      | Prize, rare, 20             |
| `dev_prize_legendary` | Prize, legendary, 8         |

Example — see a legendary win ticket without a printer:

```bash
RECEIPT_PRINT_DRY_RUN=true LOTTERY_FORCE_PRIZE_ID=dev_prize_legendary bun run dev
```

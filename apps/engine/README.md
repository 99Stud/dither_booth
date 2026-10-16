# Dither Booth Engine

The engine package runs the backend service that mediates communication between the shutter and admin browser apps and the receipt printer. It also owns the local TLS helper scripts used by the browser apps during local HTTPS setup.

The shutter and admin production servers proxy `/engine/trpc` to this service over loopback, so client devices only connect to the browser app origins.

## Development

The engine can be started independently from this directory. For the normal full-project workflow, launch the project from the repository root so Turbo can orchestrate all apps together.

### Start engine server

Development:

```bash
bun run dev
```

Production:

```bash
bun run build
bun run start
```

### Printer dry-run and lottery force (dev only)

These flags are read from the engine process env. They must not be enabled when `NODE_ENV=production`.

| Env                                 | Role                                                                                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RECEIPT_PRINT_DRY_RUN=true`        | Skip USB printer init and USB writes. Still needs a running shutter app (Puppeteer loads `/receipt-viewer`). Builds photo + lottery tickets, writes PNGs to `tmp/receipt-previews/`, and opens them. |
| `LOTTERY_FORCE_OUTCOME=win\|loss`   | Optional. Force the lottery draw outcome.                                                                                                                                                            |
| `LOTTERY_FORCE_PRIZE_ID=<prize id>` | Optional. Force that prize (implies win). Required when forcing a win.                                                                                                                               |

Rules:

- `LOTTERY_FORCE_PRIZE_ID` alone forces a win for that prize.
- `LOTTERY_FORCE_OUTCOME=win` requires `LOTTERY_FORCE_PRIZE_ID`.
- `LOTTERY_FORCE_OUTCOME=loss` cannot be combined with `LOTTERY_FORCE_PRIZE_ID`.
- Forced wins bypass cooldown, weights and `enabled`, but still take one unit of stock and insert a `draw` row. A forced prize that is out of stock (or removed) makes the draw fail.

Example:

```bash
RECEIPT_PRINT_DRY_RUN=true \
LOTTERY_FORCE_OUTCOME=win \
LOTTERY_FORCE_PRIZE_ID=your_prize_cuid \
bun run dev
```

### Check code quality

```bash
bun run lint
bun run format
bun run check-types
```

Use safe fix commands when formatting or lint rules can be applied automatically:

```bash
bun run lint:fix
bun run format:fix
```

## Infrastructure

Development runs `src/server.ts` with Bun watch mode. Production first type-checks the engine, bundles `src/production-entry.ts`, and starts the resulting `dist/server.js`.

The engine owns the local SQLite database at `data/dither-booth.sqlite` and applies SQL migrations from `drizzle`. It also owns the local HTTPS helper scripts that generate the certificate shared by the shutter and admin apps.

Production keeps native runtime dependencies such as Puppeteer, Sharp, and printer USB packages external, so the workspace dependencies must remain installed wherever the production server runs.

### Reinstall Puppeteer Chrome

During the first installation, Puppeteer downloads the Chrome binary to an external location. After a fresh install, reinstall Chrome in the Puppeteer Cache folder from the repository root:

```bash
bun run reinstall-puppeteer
```

## Database Management

Use these commands from `apps/engine`:

```bash
bun run db:generate
bun run db:migrate
bun run db:seed:lottery
bun run db:studio
```

- `db:generate` runs `drizzle-kit generate`. Use it after changing the Drizzle schema to create a SQL migration in `drizzle` from `drizzle.config.ts`.
- `db:migrate` runs the internal migration script, applies pending migrations from `drizzle` to `data/dither-booth.sqlite`, logs success or failure, and closes the SQLite connection.
- `db:seed:lottery` inserts a local event (`dev_campaign`), enabled lottery (`dev_lottery`), and sample prizes for Experience / admin / dry-run testing. The dev event becomes the active one, and any other active event is archived. Skips if that lottery already exists; pass `--reset` to wipe campaigns/draws/prizes/lotteries and reseed.
- `db:studio` runs Drizzle Studio for inspecting or editing the local SQLite database during development.

#### Seed lottery (dev)

After migrations:

```bash
bun run db:seed:lottery
```

Reset stock / wipe previous event + lottery rows and reseed:

```bash
bun run db:seed:lottery -- --reset
```

Stable IDs:

| Id                    | Role                 |
| --------------------- | -------------------- |
| `dev_campaign`        | Event / campaign     |
| `dev_lottery`         | Lottery              |
| `dev_prize_common`    | Prize (common, 100)  |
| `dev_prize_rare`      | Prize (rare, 20)     |
| `dev_prize_legendary` | Prize (legendary, 8) |

Example forced win after seeding:

```bash
RECEIPT_PRINT_DRY_RUN=true \
LOTTERY_FORCE_PRIZE_ID=dev_prize_legendary \
bun run dev
```

### Router groups

The tRPC router (`src/internal/router.ts`) is split by caller. Each group's procedures are built on one base procedure in `src/internal/trpc.ts`, which carries the group's access check:

| Group      | Base procedure    | Access             | Procedures                                                                                                                                                                                                           |
| ---------- | ----------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booth.*`  | `boothProcedure`  | Any origin (kiosk) | `getLotteryStatus`, `prepareReceipt`, `printPreparedReceipt`, `onKioskCommand`, `reportKioskStatus`, `unlockDarkroom`, `lockDarkroom`                                                                                |
| `config.*` | `configProcedure` | Admin origin only  | Event, prize and lottery CRUD, `listDraws`, `getPrintConfiguration` / `updatePrintConfiguration`, `dither`, `generateReceipt`, `printReceipt`, `printSampleLotteryTicket`, `getDarkroomPinStatus` / `setDarkroomPin` |
| `ops.*`    | `opsProcedure`    | Admin origin only  | `getHealthz`, `restartPuppeteerReceiptViewer`, `reloadKiosk`, `showKioskScreen`                                                                                                                                      |

A new procedure goes in the group of whoever calls it, and is built on that group's base procedure.

Some `config.*` and `ops.*` procedures also accept a Darkroom token; see [Darkroom access](#darkroom-access).

### Darkroom access

Print tuning happens on the booth iPad, in the Shutter's `/darkroom` route, behind a PIN.

- **The PIN** (4–8 digits) is set in admin's Settings (`config.setDarkroomPin`, admin origin only). Only its argon2id hash is stored, in the singleton `darkroom_access` table. Until a PIN is set, the Darkroom stays locked.
- **`booth.unlockDarkroom({ pin })`** returns `{ token, expiresAt }`. Tokens live in memory (`src/domains/darkroom/internal/darkroom.access.ts`):
  - a token expires 30 min after it was last used;
  - a new PIN or an engine restart revokes every token;
  - after 5 wrong PINs in a row, unlocking answers `TOO_MANY_REQUESTS` for 60 s;
  - `booth.lockDarkroom` ends the caller's session.
- **The token** travels in the `x-darkroom-token` header. `darkroomProcedure` accepts the admin origin **or** a live token, and only these procedures use it:
  - print tuning: `config.getPrintConfiguration`, `updatePrintConfiguration`, `dither`, `generateReceipt`, `printReceipt`;
  - sample tickets: `config.printSampleLotteryTicket`, plus `config.getCurrentEvent` for the prize list;
  - status: `ops.getHealthz`.

  Everything else in `config.*` and `ops.*`, including setting the PIN, stays admin-only. `src/internal/router.test.ts` checks every procedure both ways.

### Kiosk channel

The engine can push commands to the kiosk pages, for example to reload a Shutter page whose shader broke, without touching the iPad.

- **`booth.onKioskCommand({ pageId, deviceId, screen })`** is a tRPC subscription streamed over server-sent events through the Shutter's `/engine/trpc` proxy. Only the Experience route (`/`, `screen: "shutter"`) and the Darkroom route (`/darkroom`, `screen: "darkroom"`) subscribe, so the `/receipt-viewer` page that Puppeteer prints from is never reloaded. A page moving between the two ends one subscription and starts the other, so `shutter.kiosk.pages` always says which screen each page shows.
- **`ops.reloadKiosk({ mode })`** (admin origin only) sends `{ type: "reload", mode }` to every connected page and returns `{ delivered }`, the number of pages that got it. Admin's Control Center calls it from the Shutter health item, which also lists the connected pages (`ops.getHealthz` → `shutter.kiosk.pages`).
  - `when-idle` reloads once the page is back on the landing screen, so a guest's visit is never cut off, and after 90 s anyway, since a stuck flow never gets back there.
  - `now` reloads straight away.
  - The Darkroom has no guest visit to wait for: it reloads straight away in both modes.
- **`ops.showKioskScreen({ screen })`** (admin origin only) sends `{ type: "navigate", screen }` and returns `{ delivered }`. Admin's Settings calls it from the Darkroom card.
  - `darkroom` opens the Darkroom's PIN screen once the Experience is back on the landing screen (90 s at most, like `when-idle`). The PIN is still needed: the command carries no session.
  - `shutter` locks the Darkroom (`booth.lockDarkroom`) and goes back to the landing screen straight away, so a kiosk left unattended is never left unlocked.
- **`booth.reportKioskStatus({ pageId, camera })`** is the other direction: a page reports its camera (`useUserMedia`'s state, or `null` while it runs none, e.g. on the Darkroom's PIN screen) on every change and every reconnection. The engine keeps it on the page's entry until its stream ends, and returns `{ registered: false }` for a page it doesn't list (the page retries). `ops.getHealthz` returns it with each page, and admin's Control Center shows it as the **Camera** health item; a failed camera counts as unhealthy.
- The channel lives in memory (`src/domains/kiosk/internal/kiosk.channel.ts`), one per engine process. A command reaches the pages connected when it is sent and is **never replayed**: a page that was offline misses it (and `delivered` says so) rather than reloading in a loop later.
- SSE pings every 5 s keep the stream open through Bun.serve's 10 s idle timeout, and the client reconnects after 15 s of silence. The proxy forwards the browser's abort signal, so a closed page also ends its engine stream.
- A tab whose JavaScript is fully frozen can't react; it still needs a manual reload on the iPad.

Commands are the `KIOSK_COMMAND_SCHEMA` union in `@dither-booth/shared/kiosk`, so new ones (such as a theme update) are added as a new `type`. Studio will reach the same channel through a Bell `kiosk.reload` message (Phase 3).

### Event admin (one active event)

The booth runs **one active campaign (event) at a time**. Admin manages it from the Event page via `config.*` procedures:

| Procedure                                                      | Role                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `getCurrentEvent`                                              | Aggregate of the active campaign + lottery + prizes, or `null` |
| `createEvent`                                                  | Create campaign + lottery (rejects if one is active)           |
| `updateEvent`                                                  | Rename the campaign, pick its ticket kit                       |
| `replaceEvent`                                                 | Archive the active event, then create a new one                |
| `updateLotterySettings`                                        | Enable / odds / win cooldown                                   |
| `createPrize` / `updatePrize` / `deletePrize` / `restockPrize` | Prize CRUD. Stock moves only through `restockPrize` (`+N/−N`)  |

Runtime booth status (`booth.getLotteryStatus`) stays public. Draws only happen inside `booth.prepareReceipt`; the admin test print (`config.printReceipt`) prints under the sample ref `000000` and never draws.

#### Event lifecycle

Events are never deleted. `campaign.status` is `active` or `archived`:

- A partial unique index (`campaign_single_active_idx`) lets at most one campaign be `active`.
- `replaceEvent` archives the active campaign and creates the next one in the same transaction. The archived campaign's lottery, prizes, stock ledger and draws stay exactly as they were.
- Everything reads and draws through the active campaign: `getCurrentEvent`, `listDraws`, the receipt settings, the draw and `getLotteryStatus`. A lottery is only drawn against while it belongs to the active campaign and is `enabled`, so an archived event's lottery is never used, whatever its flag says.
- Every draw records `draw.campaign_id`, the event active when it ran (null when there was none). `lottery_id` is only set while that event's lottery was enabled. `listDraws` lists the active event's draws, including losses recorded while its lottery was off.
- `created_at` and `updated_at` are set on each campaign. Every event write (campaign, lottery, prizes or stock) moves `updated_at`.

Ticket refs stay unique across all events, archived ones included, so a ref always points at one draw.

#### Stock ledger

Prize stock is never stored as a number. `stock_adjustment` is an append-only ledger:

- remaining stock = sum of a prize's `delta` − its winning draws;
- `totalQuantity` = sum of its `delta`, the stock ever allocated net of corrections.

`src/domains/lottery/internal/lottery.stock.ts` is the only place either is computed.

- **Creating a prize** writes an `initial` entry for its quantity.
- **`restockPrize({ prizeId, delta, adjustmentId })`** writes a `restock` entry for a positive delta or a `correction` entry for a negative one.
  - The caller picks `adjustmentId` when the change is first requested and reuses it on retries, so the change is applied once.
  - An id reused for a different change is `CONFLICT`.
  - Removing more than what is left is `BAD_REQUEST`.
- **A win** takes its unit by inserting its `draw` row, inside the draw transaction.

Deltas commute with kiosk wins, so a restock never needs to know the current stock, and a form can't go stale.

Two triggers created in `drizzle/0011_stock_ledger.sql` refuse an adjustment or a win that would take stock below zero. drizzle-kit doesn't track triggers, and rebuilding `draw` or `stock_adjustment` would drop them. `db.migrations.test.ts` fails if they go missing.

**Future Appearance:** logo and shader colors will belong on the campaign, next to `kit_id` (or on a 1:1 event-config sibling), not on lottery. Lottery stays odds/stock only.

### Kits

The look of an event's photo receipt is its **kit**, stored on the campaign as `campaign.kit_id`. Print Configuration (`print_config`) holds device tuning only.

- `KIT_IDS` in `packages/shared/src/isomorphic/kits.ts` lists the kits this release ships. `DEFAULT_KIT_ID` (`tartines`) is used when an event names none.
- `kit_id` is free text, with no CHECK constraint and no default. It is validated in code: `createEvent` and `updateEvent` accept shipped kits only, so **adding a kit needs no migration**.
- A stored id this release doesn't ship (set by a newer release, or a kit since removed) renders the default kit and logs `event-kit-unknown` (`engine.event`, level `warn`) instead of failing the visit.
- The receipt viewer still takes the kit through its `template` search param, so a photo receipt's templates are the kits (`PHOTO_RECEIPT_TEMPLATES = KIT_IDS`).

## Local HTTPS Helpers

The local certificate is generated from this package and shared by the shutter and admin HTTPS servers.

### 1. Generate local certificate

```bash
bun run cert:generate 192.168.1.42
```

This writes:

- `.local/tls/booth-cert.pem`
- `.local/tls/booth-key.pem`
- `.local/tls/booth-manifest.json`

Use the LAN IP that other devices on the same Wi-Fi/LAN use to reach the machine running the app. Do not use `127.0.0.1` or `localhost`.

`booth-manifest.json` stores the current public IP, machine hostnames (`hostname` + `hostname.local`), and the mkcert root CA path. It becomes the runtime source of truth for HTTPS origins and intra-apps fetch TLS configuration.

### 2. Inspect mkcert root CA

```bash
bun run cert:caroot
```

Use this to locate `rootCA.pem` when another device needs to trust the locally generated certificate.

### 3. Test on a phone

```bash
bun run phone
```

With `bun run dev` running, this prints a QR code for a setup page on the LAN (`http://<LAN_IP>:3199`, `PHONE_SETUP_PORT` to change it). Scan it with the phone's camera on the same Wi-Fi. The page:

- serves the mkcert root CA (the public certificate, never its key) to install as a profile;
- shows the two trust steps in iOS Settings;
- links to the Shutter, the admin and the Darkroom.

Do this once per phone. If the page doesn't load, allow incoming connections for `bun` in the macOS firewall.

## Regenerate Or Clean Up

If LAN IP changes:

```bash
bun run cert:generate <NEW_LAN_IP>
```

If local TLS files get stale or you want to reset setup:

```bash
bun run cert:clean
```

`cert:clean` removes generated cert, key, and manifest. It does not remove mkcert root CA from your machine.

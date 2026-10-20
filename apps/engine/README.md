# Dither Booth Engine

The backend: database, lottery, printer connection, network, kiosk channel. It listens on `127.0.0.1:3001`; browsers reach it through `/engine/trpc` on the Shutter and Admin origins.

```bash
bun run dev           # watch mode
bun run build && bun run start
bun run test
bun run db:migrate    # also: db:generate, db:studio, db:seed:lottery [-- --reset]
bun run cert:generate <LAN_IP>
```

Documentation, in `apps/docs`:

- [System overview](../docs/src/content/docs/architecture/overview.md) and [A guest visit, end to end](../docs/src/content/docs/architecture/guest-visit.md)
- [Engine API](../docs/src/content/docs/reference/engine-api.md) and [Access control](../docs/src/content/docs/architecture/access-control.md)
- [Printer and printer watch](../docs/src/content/docs/architecture/printer.md), [Kiosk channel](../docs/src/content/docs/architecture/kiosk-channel.md), [Data model](../docs/src/content/docs/architecture/data-model.md)
- [Developing without a printer](../docs/src/content/docs/development/without-a-printer.md)

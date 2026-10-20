# Dither Booth Admin

The staff app: Control Center, Event, Settings. Served over HTTPS on port 3002; only its origin may call the engine's `config.*` and `ops.*` procedures.

```bash
bun run dev
bun run build && bun run start
bun run test
```

Documentation, in `apps/docs`:

- [Run the event](../docs/src/content/docs/venue/run-the-event.mdx)
- [Health checks](../docs/src/content/docs/maintenance/health-checks.mdx)
- [Access control](../docs/src/content/docs/architecture/access-control.md)

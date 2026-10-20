# Dither Booth Shutter

The guest app on the iPad (Experience at `/`), the staff Darkroom (`/darkroom`), the receipt layout page the engine's Chromium prints from (`/receipt-viewer`), and the plain-HTTP setup page on port 3003.

```bash
bun run dev
bun run build && bun run start
bun run test
```

Documentation, in `apps/docs`:

- [A guest visit, end to end](../docs/src/content/docs/architecture/guest-visit.md)
- [Tune the prints](../docs/src/content/docs/venue/tune-prints.mdx) (the Darkroom)
- [TLS and device trust](../docs/src/content/docs/architecture/tls-and-trust.md) and [Network](../docs/src/content/docs/architecture/network.md) (setup and captive pages)
- [Kiosk channel](../docs/src/content/docs/architecture/kiosk-channel.md)

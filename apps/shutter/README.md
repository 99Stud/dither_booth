# Dither Booth Shutter

Dither Booth Shutter is the primary user-facing browser app loaded on the iPad during the kiosk experience. It runs as a Bun-native React app in development and builds to a bundled Bun server for production through the shared browser-server helpers.

Static files in `public` are served from root URLs in development and copied into `dist` for production with a small public asset manifest.

## Development

The shutter app can be started independently from this directory. For the normal full-project workflow, launch the project from the repository root so Turbo can orchestrate all apps together.

### Start shutter app

Development:

```bash
bun run dev
```

Production:

```bash
bun run build
bun run start
```

### Build production server

```bash
bun run build
```

### Generate QR code

```bash
bun run generate-qr
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

## Darkroom

`/darkroom` is where staff tune the print on the booth iPad: dither mode, exposure, threshold and the other print settings, with live dithering and receipt previews, a test print, sample lottery tickets, and a printer & service status strip.

- **Opening it:** hold the landing screen's top-left corner for 3 seconds (only while no visit is running), or go to `/darkroom`.
- **PIN:** set in admin's Control Center. The Darkroom trades it for a session token (kept in `sessionStorage`, so it survives a reload but not the tab), sent to the engine as `x-darkroom-token`.
- **Locking:** the **Lock** button, a PIN change in admin, an engine restart or 30 minutes without use all lock it again.

See the engine README's "Darkroom access" section for what the token allows.

## Infrastructure

Development serves `src/index.html` and raw TypeScript entrypoints through Bun HTML imports with hot reloading.

Production builds `src/production-entry.ts` into `dist/server.js`; that entry sets the app root as cwd before loading `src/production-server.ts`. Bun emits optimized HTML and hashed build assets into `dist`.

The production server runs `dist/server.js`, serves static manifest routes over HTTPS, uses immutable cache headers for hashed build assets, and uses conservative cache headers for copied `public/` assets.

The server uses the shared local TLS certificate, proxies `/engine/trpc` to the engine over loopback, and keeps SPA fallback behavior aligned with the admin app.

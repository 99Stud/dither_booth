# Dither Booth Web

Dither Booth Web is the primary user-facing browser app loaded on the iPad during the kiosk experience. It runs as a Bun-native React app in development and builds to a bundled Bun server for production through the shared browser-server helpers.

Static files in `public` are served from root URLs in development and copied into `dist` for production with a small public asset manifest.

## Development

The web app can be started independently from this directory. For the normal full-project workflow, launch the project from the repository root so Turbo can orchestrate all apps together.

### Start web app

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

## Infrastructure

Development serves `src/index.html` and raw TypeScript entrypoints through Bun HTML imports with hot reloading.

Production builds a bundled server entry that imports `src/index.html`, then writes a small `dist/server.js` bootstrap that starts it. Bun emits optimized HTML and hashed build assets into `dist`.

The production server runs `dist/server.js`, serves static manifest routes over HTTPS, uses immutable cache headers for hashed build assets, and uses conservative cache headers for copied `public/` assets.

The server uses the shared local TLS certificate, proxies `/api/trpc` to the API over loopback, and keeps SPA fallback behavior aligned with the admin app.

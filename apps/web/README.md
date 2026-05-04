# Dither Booth Web

Dither Booth Web is the primary user-facing browser app loaded on the iPad during the kiosk experience. It runs as a Bun-native React app in development and builds to a bundled Bun server for production through the shared browser-server helpers.

Development serves `src/index.html` and raw TypeScript entrypoints through Bun HTML imports with hot reloading. Production builds a bundled server entry that imports `src/index.html`, then writes a small `dist/server.js` bootstrap that starts it. Bun emits optimized HTML and hashed build assets into `dist`; production serves those files through explicit static routes with immutable cache headers for hashed build assets and conservative cache headers for copied `public/` assets. The server keeps the same local TLS certificate, `/api/trpc` proxy, and SPA fallback behavior as the admin app.

Static files in `public` are served from root URLs in development and copied into `dist` for production with a small public asset manifest.

## Development

Run package commands from `apps/web` unless a step says to run from repo root.

### 1. Install dependencies

Run this from repo root:

```bash
bun install
```

### 2. Start web app

Development:

```bash
bun run dev
```

Production:

```bash
bun run build
bun run start
```

The production server runs `dist/server.js`, serves the Bun-built HTML and static asset manifests over HTTPS, and proxies `/api/trpc` to the API over loopback.

### 3. Build production server

```bash
bun run build
```

### 4. Check code quality

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

# Dither Booth Web

Dither Booth Web is the primary user-facing browser app loaded on the iPad during the kiosk experience. It runs as a Vite React app in development and builds to static assets for production serving.

Production uses a small Bun HTTPS server so the kiosk keeps the same local TLS certificate, `/api/trpc` proxy, and SPA fallback behavior as the admin app. Vite handles the browser bundle, React Fast Refresh, Tailwind CSS, and production assets.

Static files in `public` are served from root URLs by Vite in development and copied into `dist` for production.

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

The production server serves the built client over HTTPS and proxies `/api/trpc` to the API over loopback.

### 3. Build client bundle

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

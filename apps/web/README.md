# Dither Booth Web

The web app is a Vite React app. Vite handles the browser bundle, React Fast
Refresh, Tailwind CSS, and production assets. Production still uses a small Bun
server so the kiosk keeps the same HTTPS, `/api/trpc` proxy, and SPA fallback
behavior. Static files in `public` are served from root URLs by Vite in dev and
copied into `dist` for production.

To install dependencies:

```bash
bun install
```

To start the Vite development server:

```bash
bun run dev
```

To build the client bundle:

```bash
bun run build
```

To run the production server:

```bash
bun run build
bun run start
```

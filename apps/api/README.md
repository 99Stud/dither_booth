# Dither Booth API

The API package runs the backend service that mediates communication between the web and admin browser apps and the receipt printer. It also owns the local TLS helper scripts used by the browser apps during local HTTPS setup.

The web and admin production servers proxy `/api/trpc` to this service over loopback, so client devices only connect to the browser app origins.

## Development

The API can be started independently from this directory. For the normal full-project workflow, launch the project from the repository root so Turbo can orchestrate all apps together.

### Start API server

Development:

```bash
bun run dev
```

Production:

```bash
bun run build
bun run start
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

Development runs `src/server.ts` with Bun watch mode. Production first type-checks the API, bundles the server entry, and starts `dist/server.js`, which loads the bundled `dist/server-entry.js`.

The API owns the local SQLite database at `data/dither-booth.sqlite` and applies SQL migrations from `drizzle`. It also owns the local HTTPS helper scripts that generate the certificate shared by the web and admin apps.

Production keeps native runtime dependencies such as Puppeteer, Sharp, and printer USB packages external, so the workspace dependencies must remain installed wherever the production server runs.

## Database Management

Use these commands from `apps/api`:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

- `db:generate` runs `drizzle-kit generate`. Use it after changing the Drizzle schema to create a SQL migration in `drizzle` from `drizzle.config.ts`.
- `db:migrate` runs the internal migration script, applies pending migrations from `drizzle` to `data/dither-booth.sqlite`, logs success or failure, and closes the SQLite connection.
- `db:studio` runs Drizzle Studio for inspecting or editing the local SQLite database during development.

## Local HTTPS Helpers

The local certificate is generated from this package and shared by the web and admin HTTPS servers.

### 1. Generate local certificate

```bash
bun run cert:generate 192.168.1.42
```

This writes:

- `.local/tls/booth-cert.pem`
- `.local/tls/booth-key.pem`
- `.local/tls/booth-manifest.json`

Use the LAN IP that other devices on the same Wi-Fi/LAN use to reach the machine running the app. Do not use `127.0.0.1` or `localhost`.

`booth-manifest.json` stores the current public IP and becomes the runtime source of truth for the browser HTTPS origin.

### 2. Inspect mkcert root CA

```bash
bun run cert:caroot
```

Use this to locate `rootCA.pem` when another device needs to trust the locally generated certificate.

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

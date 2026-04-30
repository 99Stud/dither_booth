# Dither Booth API

The API package runs the backend service that mediates communication between the web and admin browser apps and the receipt printer. It also owns the local TLS helper scripts used by the browser apps during local HTTPS setup.

The web and admin production servers proxy `/api/trpc` to this service over loopback, so client devices only connect to the browser app origins.

## Development

Run package commands from `apps/api` unless a step says to run from repo root.

### 1. Install dependencies

Run this from repo root:

```bash
bun install
```

### 2. Start API server

Development:

```bash
bun run dev
```

Production:

```bash
bun run start
```

## Local HTTPS Helpers

The local certificate is generated from this package and shared by the web and admin HTTPS servers.

### 1. Generate local certificate

Run this from repo root:

```bash
bun run --filter @dither-booth/api cert:generate 192.168.1.42
```

Or run this from `apps/api`:

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
bun run --filter @dither-booth/api cert:generate <NEW_LAN_IP>
```

From `apps/api`, use:

```bash
bun run cert:generate <NEW_LAN_IP>
```

If local TLS files get stale or you want to reset setup:

```bash
bun run cert:clean
```

From repo root, use:

```bash
bun run --filter @dither-booth/api cert:clean
```

`cert:clean` removes generated cert, key, and manifest. It does not remove mkcert root CA from your machine.

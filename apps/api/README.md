# api

## Development

This package runs API server and owns local TLS helper scripts used by web app during local HTTPS setup.

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

### 3. Generate local certificate

Run this from `apps/api`:

```bash
bun run cert:generate 192.168.1.42
```

This writes:

- `.local/tls/booth-cert.pem`
- `.local/tls/booth-key.pem`
- `.local/tls/booth-manifest.json`

Use LAN IP that other devices on same Wi-Fi/LAN use to reach machine. Do not use `127.0.0.1` or `localhost`.

### 4. Inspect mkcert root CA

```bash
bun run cert:caroot
```

Use this to locate `rootCA.pem` when another device needs to trust locally generated certificate.

## Regenerate or clean up

If LAN IP changes:

```bash
bun run cert:generate <NEW_LAN_IP>
```

If local TLS files get stale or you want to reset setup:

```bash
bun run cert:clean
```

`cert:clean` removes generated cert, key, and manifest. It does not remove mkcert root CA from your machine.

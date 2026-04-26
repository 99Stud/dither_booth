# dither_booth

## Local HTTPS setup

This project serves web app over HTTPS by default so camera access works from `https://<SERVER_LAN_IP>:<WEB_PORT>` on local network devices. No custom hostname, hosts file, or local DNS server is required.

### 1. Install dependencies

```bash
bun install
```

### 2. Install mkcert

Follow the [`mkcert` install instructions](https://github.com/FiloSottile/mkcert), then make sure `mkcert` is available in your shell.

### 3. Find server LAN IP

Use IP address that other devices on same Wi-Fi/LAN use to reach machine running app. On macOS, one quick option is:

```bash
ipconfig getifaddr en0
```

If that returns nothing, try `en1` instead. On Linux or Raspberry Pi, one quick option is:

```bash
hostname -I | awk '{print $1}'
```

Use IPv4 address from your active network interface, for example `192.168.1.42`. Do not use `127.0.0.1` or `localhost`.

### 4. Generate local certificate

Run this from repo root:

```bash
bun run --filter @dither-booth/api cert:generate 192.168.1.42
```

This writes:

- `.local/tls/booth-cert.pem`
- `.local/tls/booth-key.pem`
- `.local/tls/booth-manifest.json`

`booth-manifest.json` stores current public IP and becomes runtime source of truth for HTTPS origin.

### 5. Trust mkcert root CA on client devices

Run this on machine where certificate was generated:

```bash
bun run --filter @dither-booth/api cert:caroot
```

Copy `rootCA.pem` from that directory to each client device and trust it in the OS/browser certificate store. Without this step, browsers may reject the certificate and camera access will stay blocked.

Browser traffic stays same-origin and Bun proxies `/api/trpc` to API over loopback, so client devices only need to trust web cert.

### 6. Start app

Development:

```bash
bun run dev
```

Production:

```bash
bun run start
```

Then open `https://<SERVER_LAN_IP>:3000` unless you changed `WEB_PORT`.

### 7. Verify setup

- Startup logs should show same `https://<SERVER_LAN_IP>:<WEB_PORT>` origin you expect to open.
- `.local/tls/booth-manifest.json` should show current `publicIp`.
- iPad should load same URL without hostname mapping.

Receipt generation uses same HTTPS origin, so if browser can open app and certificate is trusted, receipt rendering path should match that setup.

## Regenerate or clean up

If LAN IP changes:

```bash
bun run --filter @dither-booth/api cert:generate <NEW_LAN_IP>
```

If local TLS files get stale or you want to reset setup:

```bash
bun run --filter @dither-booth/api cert:clean
```

`cert:clean` removes generated cert, key, and manifest. It does not remove mkcert root CA from your machine.

## Environment overrides

Defaults live in:

- `apps/web/.env.example`
- `apps/api/.env.example`

Most setups can keep defaults. Override only if you need different ports, bind hosts, or TLS file paths. Web public IP is read from `.local/tls/booth-manifest.json`; regenerate certificates when LAN IP changes.

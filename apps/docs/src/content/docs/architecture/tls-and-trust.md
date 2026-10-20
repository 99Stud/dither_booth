---
title: TLS and device trust
description: Why the booth runs its own certificate authority, what the certificate covers, and how devices trust it once.
sidebar:
  order: 5
---

## Why HTTPS on a LAN

Safari only grants the camera (`getUserMedia`) to a **secure context**: HTTPS from a trusted certificate, or `localhost`. The iPad reaches the booth by IP or `.local`, so the Shutter must be HTTPS, and the iPad must trust whoever signed its certificate. A public CA can't issue for `192.168.1.42` or `booth.local`, so the booth runs **its own CA** with [mkcert](https://github.com/FiloSottile/mkcert).

## Two levels

|                      | Lifetime         | Where                                         | Changes when                                              |
| -------------------- | ---------------- | --------------------------------------------- | --------------------------------------------------------- |
| **Booth CA** (root)  | Years            | mkcert's CAROOT for the service user          | mkcert is reinstalled, the SD card is reflashed, a new Pi |
| **Leaf certificate** | Re-issued freely | `.local/tls/booth-cert.pem` + `booth-key.pem` | The LAN IP changes                                        |

Devices trust the **CA**, once. Leaf certificates come and go with venues without anyone noticing. A **new CA** is the event that matters: every device must trust again.

## What the leaf covers

`cert:generate` (run by `booth cert`) issues one certificate for:

- the current LAN IP,
- `10.42.0.1`, the booth Wi-Fi address — so switching to the booth Wi-Fi needs no new certificate,
- the machine's hostnames: `<hostname>` and `<hostname>.local`.

It writes `.local/tls/booth-manifest.json` alongside, the runtime source of truth for the apps:

```json
{
  "publicIp": "192.168.1.42",
  "generatedAt": "2026-10-19T09:12:00.000Z",
  "caPath": "/home/pi/.local/share/mkcert/rootCA.pem",
  "certPath": ".local/tls/booth-cert.pem",
  "keyPath": ".local/tls/booth-key.pem",
  "hostnames": ["booth", "booth.local"]
}
```

The web servers read it for their HTTPS origins and their allowed hostnames; the engine reads it to know the admin origin. Change the hostname, and you must regenerate.

## Re-issue at start

`ditherbooth.service` runs `booth cert --if-changed` as `ExecStartPre`. It compares the current LAN IP with `publicIp` and issues a new leaf only on a mismatch, reusing the CA. A failure there doesn't block the start (the unit line is prefixed with `-`): the booth comes up on the old certificate rather than not at all. The NetworkManager dispatcher hook restarts the service when the address changes, which triggers this.

## Getting a device to trust the CA

A device that doesn't trust the CA can't open the HTTPS apps — so the way in has to be **plain HTTP**. That's the **setup page** on port `3003`, served by the Shutter process:

- It serves the CA's **public** certificate (`rootCA.pem`) as a profile to install, never its key.
- It tests whether the device already trusts the booth by loading a resource from the HTTPS origin, and shows **Open the Shutter** when it does.
- It links to the Shutter, the Darkroom and admin, preferring `.local` origins.

The setup page is intentionally limited: it hands out a public certificate and links. Its only other job is the captive page on the booth Wi-Fi ([Network](/docs/architecture/network/#the-captive-page)).

## The CA private key

`rootCA-key.pem` in CAROOT can sign certificates any booth-trusting device accepts, for **any** name. It never leaves the Pi through the booth's own features. If you back it up to keep the same CA across a rebuild, store it as a secret. If it leaks, the fix is a new CA and re-trusting every device.

## Local development

Same mechanism on a laptop: `bun run --filter @dither-booth/engine cert:generate <LAN_IP>`, then, with `bun run dev` running, `bun run phone` prints a QR to the Shutter's setup page on `http://<LAN_IP>:3003`. See [Local setup](/docs/development/local-setup/).

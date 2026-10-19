import z from "zod";

// Defaults
export const DEFAULT_ENGINE_PORT = 3001;
export const DEFAULT_SHUTTER_PORT = 3000;
export const DEFAULT_ADMIN_PORT = 3002;
/** Plain-HTTP setup page: a device opens it before it trusts the booth CA. */
export const DEFAULT_SETUP_PORT = 3003;
export const ENGINE_BIND_HOST = "127.0.0.1";
/**
 * The booth's address on its own Wi-Fi (NetworkManager's shared mode). Always
 * in the certificate, so switching to the booth Wi-Fi restarts nothing.
 */
export const BOOTH_WIFI_IP = "10.42.0.1";
/**
 * `::` takes IPv4 and IPv6. An iPad on an IPv6-mostly network, such as an
 * iPhone's Personal Hotspot, has no IPv4 route to the booth and reaches it
 * through `<hostname>.local` over IPv6 only.
 */
export const SHUTTER_BIND_HOST = "::";
export const ADMIN_BIND_HOST = "::";
export const WEB_TLS_CERT_PATH = ".local/tls/booth-cert.pem";
export const WEB_TLS_KEY_PATH = ".local/tls/booth-key.pem";
/** Written by the engine at start, read by the setup server: owner-only. */
export const SETUP_SERVER_TOKEN_PATH = ".local/runtime/setup-server-token";
export const DEFAULT_WEB_TLS_MANIFEST_FILE_NAME = "booth-manifest.json";

export const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/engine cert:generate <LAN_IP>";

// Schemas
export const PORT_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, "must be a whole number")
  .transform(Number)
  .pipe(
    z
      .number()
      .int("must be an integer")
      .min(1, "must be between 1 and 65535")
      .max(65_535, "must be between 1 and 65535"),
  );

export const WEB_TLS_MANIFEST_SCHEMA = z.object({
  publicIp: z.ipv4().or(z.ipv6()),
  generatedAt: z.iso.datetime(),
  caPath: z.string(),
  certPath: z.string(),
  keyPath: z.string(),
  hostnames: z.array(z.string().trim().min(1)).optional().default([]),
});

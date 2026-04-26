import z from "zod";

// Defaults
export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 3000;
export const DEFAULT_API_BIND_HOST = "127.0.0.1";
export const DEFAULT_WEB_BIND_HOST = "0.0.0.0";
export const DEFAULT_WEB_TLS_CERT_PATH = ".local/tls/booth-cert.pem";
export const DEFAULT_WEB_TLS_KEY_PATH = ".local/tls/booth-key.pem";
export const DEFAULT_WEB_TLS_MANIFEST_FILE_NAME = "booth-manifest.json";

export const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/api cert:generate <LAN_IP>";

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
  certPath: z.string(),
  keyPath: z.string(),
});

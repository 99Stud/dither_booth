import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { z } from "zod";

import {
  DEFAULT_API_BIND_HOST,
  DEFAULT_API_PORT,
  DEFAULT_WEB_BIND_HOST,
  DEFAULT_WEB_PORT,
  DEFAULT_WEB_TLS_CERT_PATH,
  DEFAULT_WEB_TLS_KEY_PATH,
  DEFAULT_WEB_TLS_MANIFEST_FILE_NAME,
  WEB_PUBLIC_IP_ENV_NAME,
} from "./constants";
const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/api cert:generate <LAN_IP>";
const PORT_SCHEMA = z
  .string()
  .trim()
  .regex(/^\d+$/, "must be a whole number")
  .transform((value) => Number(value))
  .pipe(
    z
      .number()
      .int("must be an integer")
      .min(1, "must be between 1 and 65535")
      .max(65_535, "must be between 1 and 65535"),
  );

type WebTlsManifest = {
  publicIp: string;
  generatedAt: string;
  certPath: string;
  keyPath: string;
};

type RepoPathOptions = {
  repoRoot: string;
};

function getOptionalStringEnv(name: string) {
  const value = process.env[name]?.trim();

  return value && value.length > 0 ? value : undefined;
}

function getStringEnv(name: string, fallback: string) {
  return getOptionalStringEnv(name) ?? fallback;
}

function resolveRepoPath(filePath: string, repoRoot: string) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(repoRoot, filePath);
}

function formatOrigin(protocol: "http" | "https", host: string, port: number) {
  const formattedHost = isIP(host) === 6 ? `[${host}]` : host;

  return `${protocol}://${formattedHost}:${port}`;
}

function requireIpAddress(value: string, label: string) {
  if (isIP(value) === 0) {
    throw new Error(
      `Invalid ${label}: ${value}. Expected IPv4 or IPv6 address.`,
    );
  }

  return value;
}

function getWebTlsManifestError(manifestPath: string) {
  return `Run "${CERT_GENERATE_COMMAND}" to create ${manifestPath}, or set ${WEB_PUBLIC_IP_ENV_NAME}.`;
}

function readWebTlsManifest(options: RepoPathOptions) {
  const manifestPath = getWebTlsManifestPath(options);

  if (!existsSync(manifestPath)) {
    return undefined;
  }

  let rawManifest: string;

  try {
    rawManifest = readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
      { cause: error },
    );
  }

  let manifest: Partial<WebTlsManifest>;

  try {
    manifest = JSON.parse(rawManifest) as Partial<WebTlsManifest>;
  } catch (error) {
    throw new Error(
      `Failed to parse TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
      { cause: error },
    );
  }

  if (
    typeof manifest.publicIp !== "string" ||
    typeof manifest.generatedAt !== "string" ||
    typeof manifest.certPath !== "string" ||
    typeof manifest.keyPath !== "string"
  ) {
    throw new Error(
      `Invalid TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
    );
  }

  return {
    publicIp: requireIpAddress(
      manifest.publicIp.trim(),
      `publicIp in ${manifestPath}`,
    ),
    generatedAt: manifest.generatedAt,
    certPath: manifest.certPath,
    keyPath: manifest.keyPath,
  } satisfies WebTlsManifest;
}

function getConnectableHost(bindHost: string) {
  if (bindHost === "0.0.0.0") {
    return "127.0.0.1";
  }

  if (bindHost === "::") {
    return "::1";
  }

  return bindHost;
}

export function getPort(name: "API_PORT" | "WEB_PORT") {
  const value = process.env[name];

  if (!value) {
    return name === "API_PORT" ? DEFAULT_API_PORT : DEFAULT_WEB_PORT;
  }

  const result = PORT_SCHEMA.safeParse(value);

  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Invalid port in environment variable ${name}: ${value}. ${issue?.message ?? z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

export function getApiBindHost() {
  return getStringEnv("API_BIND_HOST", DEFAULT_API_BIND_HOST);
}

export function getApiInternalOrigin() {
  return formatOrigin(
    "http",
    getConnectableHost(getApiBindHost()),
    getPort("API_PORT"),
  );
}

export function getWebBindHost() {
  return getStringEnv("WEB_BIND_HOST", DEFAULT_WEB_BIND_HOST);
}

export function getWebPublicIp(options: RepoPathOptions) {
  const envValue = getOptionalStringEnv(WEB_PUBLIC_IP_ENV_NAME);

  if (envValue) {
    return requireIpAddress(envValue, WEB_PUBLIC_IP_ENV_NAME);
  }

  const manifestPath = getWebTlsManifestPath(options);
  const manifest = readWebTlsManifest(options);

  if (!manifest) {
    throw new Error(
      `Missing public web IP. ${getWebTlsManifestError(manifestPath)}`,
    );
  }

  return manifest.publicIp;
}

export function getWebOrigin(options: RepoPathOptions) {
  return formatOrigin("https", getWebPublicIp(options), getPort("WEB_PORT"));
}

export function getWebTlsCertPath({ repoRoot }: RepoPathOptions) {
  return resolveRepoPath(
    getStringEnv("WEB_TLS_CERT_PATH", DEFAULT_WEB_TLS_CERT_PATH),
    repoRoot,
  );
}

export function getWebTlsKeyPath({ repoRoot }: RepoPathOptions) {
  return resolveRepoPath(
    getStringEnv("WEB_TLS_KEY_PATH", DEFAULT_WEB_TLS_KEY_PATH),
    repoRoot,
  );
}

export function getWebTlsManifestPath({ repoRoot }: RepoPathOptions) {
  return path.resolve(
    path.dirname(getWebTlsCertPath({ repoRoot })),
    DEFAULT_WEB_TLS_MANIFEST_FILE_NAME,
  );
}

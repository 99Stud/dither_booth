import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

import type { RepoPathOptions } from "./internal/ports.types";

import {
  CERT_GENERATE_COMMAND,
  DEFAULT_API_BIND_HOST,
  DEFAULT_API_PORT,
  DEFAULT_WEB_BIND_HOST,
  DEFAULT_WEB_PORT,
  DEFAULT_WEB_TLS_CERT_PATH,
  DEFAULT_WEB_TLS_KEY_PATH,
  DEFAULT_WEB_TLS_MANIFEST_FILE_NAME,
  PORT_SCHEMA,
  WEB_TLS_MANIFEST_SCHEMA,
} from "./internal/ports.constants";
import { getStringEnv } from "./internal/ports.utils";

function resolveRepoPath(filePath: string, repoRoot: string) {
  return isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
}

function formatOrigin(protocol: "http" | "https", host: string, port: number) {
  const ipv6 = z.ipv6().safeParse(host);

  const formattedHost = ipv6.success ? `[${ipv6.data}]` : host;

  return `${protocol}://${formattedHost}:${port}`;
}

function getWebTlsManifestError(manifestPath: string) {
  return `Run "${CERT_GENERATE_COMMAND}" to create ${manifestPath}.`;
}

async function readWebTlsManifest(options: RepoPathOptions) {
  const manifestPath = getWebTlsManifestPath(options);
  const manifestFile = Bun.file(manifestPath);

  if (!(await manifestFile.exists())) {
    return undefined;
  }

  const rawManifest = await manifestFile.text().catch((error) => {
    throw new Error(
      `Failed to read TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
      { cause: error },
    );
  });

  let rawParsedManifest: unknown;

  try {
    rawParsedManifest = JSON.parse(rawManifest);
  } catch (error) {
    throw new Error(
      `Failed to parse TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
      { cause: error },
    );
  }

  const manifest = WEB_TLS_MANIFEST_SCHEMA.safeParse(rawParsedManifest);

  if (!manifest.success) {
    throw new Error(
      `Failed to parse TLS manifest at ${manifestPath}. ${getWebTlsManifestError(manifestPath)}`,
      { cause: manifest.error },
    );
  }

  return {
    publicIp: manifest.data.publicIp,
    generatedAt: manifest.data.generatedAt,
    certPath: manifest.data.certPath,
    keyPath: manifest.data.keyPath,
  };
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

export async function getWebPublicIp(options: RepoPathOptions) {
  const manifestPath = getWebTlsManifestPath(options);
  const manifest = await readWebTlsManifest(options);

  if (!manifest) {
    throw new Error(
      `Missing public web IP. ${getWebTlsManifestError(manifestPath)}`,
    );
  }

  return manifest.publicIp;
}

export async function getWebOrigin(options: RepoPathOptions) {
  return formatOrigin(
    "https",
    await getWebPublicIp(options),
    getPort("WEB_PORT"),
  );
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
  return resolve(
    dirname(getWebTlsCertPath({ repoRoot })),
    DEFAULT_WEB_TLS_MANIFEST_FILE_NAME,
  );
}

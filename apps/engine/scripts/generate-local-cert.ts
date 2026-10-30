import {
  BOOTH_WIFI_IP,
  getShutterOrigin,
  getWebTlsCertPath,
  getWebTlsKeyPath,
  getWebTlsManifestPath,
} from "@dither-booth/ports";
import { getMachineCertificateHostnames } from "@dither-booth/ports/hostname";
import { isReleaseBundle } from "@dither-booth/shared/server/booth-update";
import { mkdirSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";

import { ENGINE_REPO_ROOT } from "#lib/constants";

const certPath = getWebTlsCertPath({ repoRoot: ENGINE_REPO_ROOT });
const keyPath = getWebTlsKeyPath({ repoRoot: ENGINE_REPO_ROOT });
const manifestPath = getWebTlsManifestPath({ repoRoot: ENGINE_REPO_ROOT });
const cliArgs = process.argv.slice(2);
const requestedPublicIp = cliArgs.find((arg) => !arg.startsWith("-"))?.trim();
// Re-issuing the leaf on a new network: the CA is already trusted where it
// needs to be, and `mkcert -install` would ask for sudo the service doesn't have.
const skipInstall = cliArgs.includes("--skip-install");
// A release has no `scripts/` to run through `bun run`: point at the CLI there.
const release = isReleaseBundle(ENGINE_REPO_ROOT);
const CERT_GENERATE_COMMAND = release
  ? "sudo booth cert <LAN_IP>"
  : "bun run --filter @dither-booth/engine cert:generate <LAN_IP>";
const CERT_CAROOT_COMMAND = release
  ? "booth cert copy"
  : "bun run --filter @dither-booth/engine cert:caroot";

function isCommandNotFoundError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function throwMkcertError(error: unknown): never {
  if (isCommandNotFoundError(error)) {
    throw new Error(
      `mkcert is required to generate local TLS files. Install it first, then re-run "${CERT_GENERATE_COMMAND}".`,
    );
  }

  throw error;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: ${CERT_GENERATE_COMMAND}`);
  process.exit(0);
}

if (!requestedPublicIp) {
  throw new Error(`Missing LAN IP. Run "${CERT_GENERATE_COMMAND}".`);
}

if (isIP(requestedPublicIp) === 0) {
  throw new Error(
    `Invalid LAN IP: ${requestedPublicIp}. Expected IPv4 or IPv6 address.`,
  );
}

const publicIp = requestedPublicIp;
const hostnames = getMachineCertificateHostnames();
// The booth Wi-Fi's address too: switching to it then needs no new certificate.
const certificateNames = [
  ...new Set([
    publicIp,
    BOOTH_WIFI_IP,
    "localhost",
    "127.0.0.1",
    "::1",
    ...hostnames,
  ]),
];

const directories = new Set([
  dirname(certPath),
  dirname(keyPath),
  dirname(manifestPath),
]);

function runMkcert(args: string[]) {
  let result: Bun.SyncSubprocess;

  try {
    result = Bun.spawnSync(["mkcert", ...args], {
      stderr: "inherit",
      stdout: "inherit",
    });
  } catch (error) {
    throwMkcertError(error);
  }

  if (!result.success) {
    process.exit(result.exitCode);
  }
}

function readMkcertOutput(args: string[]) {
  let result: Bun.SyncSubprocess;

  try {
    result = Bun.spawnSync(["mkcert", ...args]);
  } catch (error) {
    throwMkcertError(error);
  }

  if (!result.success) {
    const stderr = result.stderr?.toString().trim();

    if (stderr) {
      console.error(stderr);
    }

    process.exit(result.exitCode);
  }

  return result.stdout?.toString().trim() ?? "";
}

for (const directory of directories) {
  mkdirSync(directory, { recursive: true });
}

const caRoot = readMkcertOutput(["-CAROOT"]);

if (!caRoot) {
  throw new Error("mkcert returned an empty CA root path.");
}

const caPath = join(caRoot, "rootCA.pem");

if (skipInstall && (await Bun.file(caPath).exists())) {
  console.log("Reusing the existing mkcert local CA.");
} else {
  console.log("Installing mkcert local CA if needed...");
  runMkcert(["-install"]);
}

if (!(await Bun.file(caPath).exists())) {
  throw new Error(
    `Missing mkcert root CA at ${caPath}. Re-run "${CERT_GENERATE_COMMAND}" after mkcert is installed correctly.`,
  );
}

console.log(`Generating TLS certificate for ${certificateNames.join(", ")}...`);
runMkcert(["-cert-file", certPath, "-key-file", keyPath, ...certificateNames]);

await Bun.write(
  manifestPath,
  `${JSON.stringify(
    {
      caPath,
      certPath,
      generatedAt: new Date().toISOString(),
      hostnames,
      keyPath,
      publicIp,
    },
    null,
    2,
  )}\n`,
);

console.log(`Certificate written to ${certPath}`);
console.log(`Private key written to ${keyPath}`);
console.log(`Root CA path recorded as ${caPath}`);
console.log(`Manifest written to ${manifestPath}`);
console.log(`Open ${await getShutterOrigin({ repoRoot: ENGINE_REPO_ROOT })}`);
console.log(
  `If another device needs to trust this certificate, use "${CERT_CAROOT_COMMAND}" to locate mkcert root CA.`,
);

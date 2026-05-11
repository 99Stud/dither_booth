import { API_REPO_ROOT } from "#lib/constants";
import {
  getWebOrigin,
  getWebTlsCertPath,
  getWebTlsKeyPath,
  getWebTlsManifestPath,
} from "@dither-booth/ports";
import { mkdirSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";

const certPath = getWebTlsCertPath({ repoRoot: API_REPO_ROOT });
const keyPath = getWebTlsKeyPath({ repoRoot: API_REPO_ROOT });
const manifestPath = getWebTlsManifestPath({ repoRoot: API_REPO_ROOT });
const requestedPublicIp = process.argv[2]?.trim();
const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/api cert:generate <LAN_IP>";
const CERT_CAROOT_COMMAND = "bun run --filter @dither-booth/api cert:caroot";

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
const certificateNames = [
  ...new Set([publicIp, "localhost", "127.0.0.1", "::1"]),
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

console.log("Installing mkcert local CA if needed...");
runMkcert(["-install"]);

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
console.log(`Open ${await getWebOrigin({ repoRoot: API_REPO_ROOT })}`);
console.log(
  `If another device needs to trust this certificate, use "${CERT_CAROOT_COMMAND}" to locate mkcert root CA.`,
);

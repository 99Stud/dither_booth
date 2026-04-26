import { API_REPO_ROOT } from "#lib/constants";
import {
  getWebOrigin,
  getWebTlsCertPath,
  getWebTlsKeyPath,
  getWebTlsManifestPath,
} from "@dither-booth/ports";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname } from "node:path";

const certPath = getWebTlsCertPath({ repoRoot: API_REPO_ROOT });
const keyPath = getWebTlsKeyPath({ repoRoot: API_REPO_ROOT });
const manifestPath = getWebTlsManifestPath({ repoRoot: API_REPO_ROOT });
const requestedPublicIp = process.argv[2]?.trim();
const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/api cert:generate <LAN_IP>";
const CERT_CAROOT_COMMAND = "bun run --filter @dither-booth/api cert:caroot";

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
  const result = spawnSync("mkcert", args, { stdio: "inherit" });

  if (result.error) {
    if ("code" in result.error && result.error.code === "ENOENT") {
      throw new Error(
        `mkcert is required to generate local TLS files. Install it first, then re-run "${CERT_GENERATE_COMMAND}".`,
      );
    }

    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const directory of directories) {
  mkdirSync(directory, { recursive: true });
}

console.log("Installing mkcert local CA if needed...");
runMkcert(["-install"]);

console.log(`Generating TLS certificate for ${certificateNames.join(", ")}...`);
runMkcert(["-cert-file", certPath, "-key-file", keyPath, ...certificateNames]);

writeFileSync(
  manifestPath,
  `${JSON.stringify(
    {
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
console.log(`Manifest written to ${manifestPath}`);
console.log(`Open ${await getWebOrigin({ repoRoot: API_REPO_ROOT })}`);
console.log(
  `If another device needs to trust this certificate, use "${CERT_CAROOT_COMMAND}" to locate mkcert root CA.`,
);

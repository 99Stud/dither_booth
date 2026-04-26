import { API_REPO_ROOT } from "#lib/constants";
import {
  getWebTlsCertPath,
  getWebTlsKeyPath,
  getWebTlsManifestPath,
} from "@dither-booth/ports";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const managedFiles = [
  getWebTlsCertPath({ repoRoot: API_REPO_ROOT }),
  getWebTlsKeyPath({ repoRoot: API_REPO_ROOT }),
  getWebTlsManifestPath({ repoRoot: API_REPO_ROOT }),
];

let removedFileCount = 0;

for (const filePath of managedFiles) {
  if (!existsSync(filePath)) {
    continue;
  }

  rmSync(filePath, { force: true });
  removedFileCount += 1;
  console.log(`Removed ${filePath}`);
}

for (const directory of new Set(
  managedFiles.map((filePath) => dirname(filePath)),
)) {
  if (!existsSync(directory) || readdirSync(directory).length > 0) {
    continue;
  }

  rmSync(directory, { force: true, recursive: true });
  console.log(`Removed empty directory ${directory}`);
}

if (removedFileCount === 0) {
  console.log("No local TLS artifacts found.");
}

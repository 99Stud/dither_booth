import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/** Written at the root of a release bundle by `.github/workflows/release.yml`. */
export const RELEASE_MANIFEST_FILE = "release.json";

const releaseManifestSchema = z.object({ version: z.string().min(1) });

function readManifestVersion(repoRoot: string): string | null {
  try {
    const text = readFileSync(resolve(repoRoot, RELEASE_MANIFEST_FILE), "utf8");
    const parsed = releaseManifestSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.version : null;
  } catch {
    return null;
  }
}

function describeCheckout(repoRoot: string): string | null {
  // The checkout is the service user's: git refuses another user's repository
  // (root's `booth update` in a unit, for one) unless it is named safe.
  const proc = Bun.spawnSync(
    [
      "git",
      "-c",
      `safe.directory=${repoRoot}`,
      "describe",
      "--tags",
      "--always",
    ],
    { cwd: repoRoot, stderr: "ignore" },
  );
  const described = proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
  return described ? described.replace(/^v/u, "") : null;
}

/**
 * The release the booth runs: `release.json`'s version in a release bundle,
 * else `git describe` of the checkout (`0.6.1`, or `0.6.1-3-gabc1234` past
 * the tag), else `0.0.0-dev`. Read once at start.
 */
export function readRelease(repoRoot: string): string {
  return (
    readManifestVersion(repoRoot) ?? describeCheckout(repoRoot) ?? "0.0.0-dev"
  );
}

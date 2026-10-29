import type { SupportedArch } from "#internal/system";

import { RELEASES_REPO } from "#internal/config";

/*
 * The GitHub release a version names, as `.github/workflows/release.yml`
 * publishes it: the bundle, the CLI binaries and SHA256SUMS.
 */

export const bundleAssetName = (version: string, arch: SupportedArch) =>
  `dither-booth-${version}-linux-${arch}.tar.zst`;

export const cliAssetName = (arch: SupportedArch) => `booth-linux-${arch}`;

export const SHA256SUMS_ASSET = "SHA256SUMS";

export const releaseAssetUrl = (version: string, asset: string) =>
  `https://github.com/${RELEASES_REPO}/releases/download/v${version}/${asset}`;

/** `sha256sum` output: `<hex>  <file>` per line. */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();

  for (const line of text.split("\n")) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/u.exec(line.trim());
    if (match?.[1] && match[2]) sums.set(match[2], match[1]);
  }

  return sums;
}

export async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");

  for await (const chunk of Bun.file(path).stream()) {
    hasher.update(chunk);
  }

  return hasher.digest("hex");
}

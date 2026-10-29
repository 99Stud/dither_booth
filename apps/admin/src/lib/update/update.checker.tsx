import { BOOTH_RELEASES_REPO } from "@dither-booth/shared/booth-update";

import type { LatestRelease, ReleaseCheck } from "./update.protocol";

import { UPDATE_CHECK_INTERVAL_MS } from "./update.constants";

/*
 * The latest release on GitHub, as the admin server last saw it. It asks
 * at start, then every 6 h, and when staff press Check now. A booth on
 * its own Wi-Fi has no internet: that's a state, not an error.
 */

export type ReleaseChecker = {
  read: () => { latest: LatestRelease | null; check: ReleaseCheck };
  checkNow: () => Promise<void>;
  stop: () => void;
};

type GithubRelease = {
  tag_name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
};

const asString = (value: unknown) => (typeof value === "string" ? value : null);

export function createReleaseChecker({
  fetch: fetchImpl = fetch,
  now = () => new Date(),
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
}: {
  fetch?: typeof fetch;
  now?: () => Date;
  intervalMs?: number;
} = {}): ReleaseChecker {
  let latest: LatestRelease | null = null;
  let check: ReleaseCheck = { state: "never", checkedAt: null, message: null };
  let running: Promise<void> | undefined;

  const run = async () => {
    try {
      const response = await fetchImpl(
        `https://api.github.com/repos/${BOOTH_RELEASES_REPO}/releases/latest`,
        {
          headers: { accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}.`);
      }

      const body = (await response.json()) as GithubRelease;
      const version = asString(body.tag_name)?.replace(/^v/u, "");

      if (!version) throw new Error("GitHub's latest release has no tag.");

      latest = {
        version,
        notes: asString(body.body) ?? "",
        url: asString(body.html_url) ?? "",
        publishedAt: asString(body.published_at),
      };
      check = { state: "ok", checkedAt: now().toISOString(), message: null };
    } catch (error) {
      check = {
        state: "unreachable",
        checkedAt: now().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // One request at a time: Check now during a check waits for it.
  const checkNow = () => {
    running ??= run().finally(() => {
      running = undefined;
    });
    return running;
  };

  void checkNow();
  const timer = setInterval(() => void checkNow(), intervalMs);

  return {
    read: () => ({ latest, check }),
    checkNow,
    stop: () => clearInterval(timer),
  };
}

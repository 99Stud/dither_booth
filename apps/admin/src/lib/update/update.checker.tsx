import { fetchLatestRelease } from "@dither-booth/shared/booth-update";

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
      latest = await fetchLatestRelease({
        fetch: fetchImpl,
        signal: AbortSignal.timeout(10_000),
      });
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

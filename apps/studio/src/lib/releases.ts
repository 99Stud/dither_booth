import {
  compareReleaseVersions,
  fetchLatestRelease,
  isReleaseVersion,
} from "@dither-booth/shared/booth-update";
import { useEffect, useState } from "react";

/*
 * The latest booth release, from GitHub, to tell staff which booths are
 * behind. Read once per screen: it changes a few times a month.
 */

/** The latest release's version, or null when GitHub doesn't answer. */
export const fetchLatestVersion = (): Promise<string | null> =>
  fetchLatestRelease().then(
    (latest) => latest.version,
    () => null,
  );

/** The latest release, or null while unknown (or GitHub didn't answer). */
export function useLatestRelease(): string | null {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLatestVersion().then((version) => {
      if (!cancelled) setLatest(version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return latest;
}

/**
 * Whether a booth on `release` is behind `latest`. A booth on a git
 * checkout (`0.7.2-3-gabc`) is behind any release.
 */
export function isBehind(release: string, latest: string | null): boolean {
  if (!latest || !release) return false;
  return (
    !isReleaseVersion(release) || compareReleaseVersions(latest, release) > 0
  );
}

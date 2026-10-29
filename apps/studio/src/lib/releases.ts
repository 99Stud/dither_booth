import {
  BOOTH_RELEASES_REPO,
  compareReleaseVersions,
  isReleaseVersion,
} from "@dither-booth/shared/booth-update";
import { useEffect, useState } from "react";

/*
 * The latest booth release, from GitHub, to tell staff which booths are
 * behind. Read once per screen: it changes a few times a month.
 */

export async function fetchLatestRelease(): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${BOOTH_RELEASES_REPO}/releases/latest`,
    { headers: { accept: "application/vnd.github+json" } },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { tag_name?: unknown };
  const version =
    typeof body.tag_name === "string" ? body.tag_name.replace(/^v/u, "") : "";
  return isReleaseVersion(version) ? version : null;
}

/** The latest release, or null while unknown (or GitHub didn't answer). */
export function useLatestRelease(): string | null {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLatestRelease().then(
      (version) => {
        if (!cancelled) setLatest(version);
      },
      () => {},
    );
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

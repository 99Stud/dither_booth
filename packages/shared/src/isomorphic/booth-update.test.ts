import { describe, expect, test } from "bun:test";

import {
  compareReleaseVersions,
  fetchLatestRelease,
  getBoothRollbackUnit,
  getBoothUpdateUnit,
  isReleaseVersion,
} from "./booth-update";

describe("release versions", () => {
  test("accepts tag versions without the v, and nothing a shell could use", () => {
    for (const version of ["0.8.0", "10.0.12", "0.8.0-rc.1"]) {
      expect(isReleaseVersion(version)).toBe(true);
    }

    for (const version of ["v0.8.0", "0.8", "0.8.0;reboot", "../0.8.0", ""]) {
      expect(isReleaseVersion(version)).toBe(false);
    }
  });

  test("orders releases, a pre-release before its release", () => {
    const sorted = [
      "0.10.0",
      "0.8.0",
      "0.8.0-rc.10",
      "0.8.0-rc.2",
      "0.7.2",
    ].toSorted(compareReleaseVersions);

    expect(sorted).toEqual([
      "0.7.2",
      "0.8.0-rc.2",
      "0.8.0-rc.10",
      "0.8.0",
      "0.10.0",
    ]);
    expect(compareReleaseVersions("0.8.0", "0.8.0")).toBe(0);
  });
});

describe("unit names", () => {
  test("escape a pre-release's dash as systemd does", () => {
    expect(getBoothUpdateUnit("0.8.0")).toBe(
      "ditherbooth-update@0.8.0.service",
    );
    expect(getBoothUpdateUnit("0.8.0-rc.1")).toBe(
      "ditherbooth-update@0.8.0\\x2drc.1.service",
    );
    expect(getBoothRollbackUnit("restore-db")).toBe(
      "ditherbooth-rollback@restore\\x2ddb.service",
    );
  });

  test("refuse anything that isn't a release version", () => {
    expect(() => getBoothUpdateUnit("0.8.0 && reboot")).toThrow();
  });
});

describe("fetchLatestRelease", () => {
  const answering = (body: unknown, status = 200) =>
    (async () => Response.json(body, { status })) as unknown as typeof fetch;

  test("reads GitHub's latest release, without the v", async () => {
    expect(
      await fetchLatestRelease({
        fetch: answering({
          tag_name: "v0.8.0",
          body: "notes",
          html_url: "https://github.com/x",
          published_at: "2026-10-28T09:00:00Z",
        }),
      }),
    ).toEqual({
      version: "0.8.0",
      notes: "notes",
      url: "https://github.com/x",
      publishedAt: "2026-10-28T09:00:00Z",
    });
  });

  test("throws when GitHub doesn't answer, or tags something that isn't a version", async () => {
    expect(fetchLatestRelease({ fetch: answering({}, 403) })).rejects.toThrow(
      "403",
    );
    expect(
      fetchLatestRelease({ fetch: answering({ tag_name: "nightly" }) }),
    ).rejects.toThrow("isn't a version");
  });
});

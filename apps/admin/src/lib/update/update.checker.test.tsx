import { afterEach, describe, expect, it } from "bun:test";

import { createReleaseChecker } from "./update.checker";

const stops: Array<() => void> = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

const NOW = () => new Date("2026-10-29T10:00:00.000Z");

describe("createReleaseChecker", () => {
  it("reads GitHub's latest release at start, without the v", async () => {
    const urls: string[] = [];
    const checker = createReleaseChecker({
      now: NOW,
      fetch: (async (input: string | URL | Request) => {
        urls.push(String(input));
        return Response.json({
          tag_name: "v0.8.0",
          body: "## What's Changed",
          html_url:
            "https://github.com/99Stud/dither_booth/releases/tag/v0.8.0",
          published_at: "2026-10-28T09:00:00Z",
        });
      }) as typeof fetch,
    });
    stops.push(checker.stop);
    await checker.checkNow();

    expect(urls[0]).toBe(
      "https://api.github.com/repos/99Stud/dither_booth/releases/latest",
    );
    expect(checker.read()).toEqual({
      latest: {
        version: "0.8.0",
        notes: "## What's Changed",
        url: "https://github.com/99Stud/dither_booth/releases/tag/v0.8.0",
        publishedAt: "2026-10-28T09:00:00Z",
      },
      check: {
        state: "ok",
        checkedAt: "2026-10-29T10:00:00.000Z",
        message: null,
      },
    });
  });

  it("is unreachable without internet, and keeps the last release it saw", async () => {
    let online = true;
    const checker = createReleaseChecker({
      now: NOW,
      fetch: (async () => {
        if (!online) throw new TypeError("fetch failed");
        return Response.json({ tag_name: "v0.8.0" });
      }) as unknown as typeof fetch,
    });
    stops.push(checker.stop);
    await checker.checkNow();
    online = false;
    await checker.checkNow();

    expect(checker.read().check).toMatchObject({
      state: "unreachable",
      message: "fetch failed",
    });
    expect(checker.read().latest?.version).toBe("0.8.0");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readRelease } from "./release";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "release-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const git = (...args: string[]) => {
  const proc = Bun.spawnSync(
    ["git", "-c", "user.name=t", "-c", "user.email=t@t", ...args],
    { cwd: root, stderr: "ignore" },
  );
  expect(proc.exitCode).toBe(0);
};

const taggedCheckout = () => {
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "first");
  git("tag", "v0.6.1");
};

describe("readRelease", () => {
  test("a release bundle reports its release.json version", async () => {
    taggedCheckout();
    await writeFile(
      join(root, "release.json"),
      JSON.stringify({
        version: "0.8.0-rc.1",
        sha: "abc1234",
        builtAt: "2026-10-29T10:00:00Z",
      }),
    );

    expect(readRelease(root)).toBe("0.8.0-rc.1");
  });

  test("a checkout reports git describe, without the v", () => {
    taggedCheckout();

    expect(readRelease(root)).toBe("0.6.1");
  });

  test("a checkout past its tag reports the distance and commit", () => {
    taggedCheckout();
    git("commit", "-q", "--allow-empty", "-m", "second");

    expect(readRelease(root)).toMatch(/^0\.6\.1-1-g[0-9a-f]+$/u);
  });

  test("an unreadable release.json falls back to the checkout", async () => {
    taggedCheckout();
    await writeFile(join(root, "release.json"), "{ not json");

    expect(readRelease(root)).toBe("0.6.1");
  });

  test("neither a bundle nor a checkout reports 0.0.0-dev", async () => {
    await writeFile(join(root, "release.json"), JSON.stringify({}));

    expect(readRelease(root)).toBe("0.0.0-dev");
  });
});

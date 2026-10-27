import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readPm2ProcessNames } from "./logs.pm2";

const REPO_ROOT = resolve(import.meta.dir, "../../../../..");

describe("readPm2ProcessNames", () => {
  it("reads each service's PM2 process from the repo's pm2.config.js", async () => {
    expect(await readPm2ProcessNames(REPO_ROOT)).toEqual({
      engine: "dither-booth-engine",
      shutter: "dither-booth-shutter",
      admin: "dither-booth-admin",
    });
  });

  it("refuses a config without a process for every service", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "dither-booth-pm2-config-"));

    try {
      await writeFile(
        join(repoRoot, "pm2.config.js"),
        'export const PM2_PROCESS_NAMES = { engine: "e", shutter: "s" };\n',
      );

      await expect(readPm2ProcessNames(repoRoot)).rejects.toThrow();
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});

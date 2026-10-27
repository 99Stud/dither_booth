import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PM2_LOG_RELATIVE_DIR, PM2_PROCESS_NAMES } from "./booth-system";

const REPO_ROOT = resolve(import.meta.dir, "../../../..");

type Pm2Config = {
  PM2_PROCESS_NAMES: Record<string, string>;
  apps: { name: string; log_file: string }[];
};

const loadPm2Config = async () => {
  return (await import(
    pathToFileURL(resolve(REPO_ROOT, "pm2.config.js")).href
  )) as Pm2Config;
};

// PM2 loads pm2.config.js without the workspace, so it repeats these names.
describe("pm2.config.js", () => {
  it("names the same processes as booth-system", async () => {
    const config = await loadPm2Config();

    expect(config.PM2_PROCESS_NAMES).toEqual(PM2_PROCESS_NAMES);
  });

  it("writes each process's log where booth-system says", async () => {
    const config = await loadPm2Config();

    expect(config.apps.map((app) => app.log_file).sort()).toEqual(
      Object.values(PM2_PROCESS_NAMES)
        .map((name) => resolve(REPO_ROOT, PM2_LOG_RELATIVE_DIR, `${name}.log`))
        .sort(),
    );
  });
});

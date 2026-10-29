import { engineHealthzPayloadSchema } from "@dither-booth/shared/healthz";
import { readRelease } from "@dither-booth/shared/server/release";
import { chmod, copyFile, mkdir, rename, statfs } from "node:fs/promises";
import { dirname } from "node:path";

import { runNetworkSetupCommand } from "#commands/network";
import { runServiceCommand } from "#commands/service";
import { BOOTH_BIN, SERVICE_NAME } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import {
  asServiceUser,
  capture,
  chownToServiceUser,
  detectArch,
  run,
  serviceBun,
} from "#internal/system";
import { info } from "#internal/ui";

import type { UpdateHost } from "./update";

import { sha256File } from "./update.release";

const ENGINE_HEALTHZ_URL = "http://127.0.0.1:3001/healthz";

async function engineHealthy(): Promise<boolean> {
  try {
    const response = await fetch(ENGINE_HEALTHZ_URL, {
      signal: AbortSignal.timeout(3_000),
    });
    return (
      response.ok &&
      engineHealthzPayloadSchema.safeParse(await response.json()).success
    );
  } catch {
    return false;
  }
}

/** The booth this CLI runs on, as `booth update` and `booth rollback` act on it. */
export const hostUpdateHost: UpdateHost = {
  now: () => new Date(),
  fetch,
  sleep: (ms) => Bun.sleep(ms),
  arch: detectArch(),
  async freeBytes(path) {
    const stats = await statfs(path);
    return stats.bavail * stats.bsize;
  },
  releaseOf: (dir) => readRelease(dir),
  async unpack(bundle, dir) {
    await mkdir(dir, { recursive: true });
    await chownToServiceUser(dir);
    await run(asServiceUser(["tar", "--zstd", "-xf", bundle, "-C", dir]));
  },
  chownToServiceUser,
  async setupSystem() {
    await runServiceCommand(buildBoothContext());
    await runNetworkSetupCommand();
  },
  restartBooth: async () => {
    await run(["systemctl", "restart", SERVICE_NAME]);
  },
  stopBooth: async () => {
    await run(["systemctl", "stop", SERVICE_NAME]);
  },
  startBooth: async () => {
    await run(["systemctl", "start", SERVICE_NAME]);
  },
  async probeHealth(repoLink) {
    const active = await capture(["systemctl", "is-active", SERVICE_NAME], {
      allowFailure: true,
    });
    // `pm2 jlist` would start a second daemon when the service's is down.
    const list =
      active.stdout.trim() === "active"
        ? await capture(serviceBun(["./node_modules/pm2/bin/pm2", "jlist"]), {
            cwd: repoLink,
            allowFailure: true,
          })
        : undefined;

    return {
      pm2: list?.exitCode === 0 ? list.stdout : undefined,
      engineHealthy: await engineHealthy(),
      now: Date.now(),
    };
  },
  async installCli(binary) {
    const installed = await sha256File(BOOTH_BIN).catch(() => "");

    if (installed === (await sha256File(binary))) return false;

    const next = `${BOOTH_BIN}.next`;
    await mkdir(dirname(BOOTH_BIN), { recursive: true });
    await copyFile(binary, next);
    await chmod(next, 0o755);
    await rename(next, BOOTH_BIN);
    return true;
  },
  runInstalledCli: (args) =>
    run([BOOTH_BIN, ...args, "--no-banner", "--color=never"], {
      allowFailure: true,
    }),
  log: info,
};

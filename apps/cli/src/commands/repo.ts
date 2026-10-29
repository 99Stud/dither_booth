import { defineCommand } from "citty";
import { lstat } from "node:fs/promises";

import type { BoothContext } from "#internal/context";

import { REPO_GIT_URL } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import {
  SilentExit,
  asServiceUser,
  capture,
  chownToServiceUser,
  detectArch,
  isRoot,
  run,
  serviceBun,
} from "#internal/system";
import { fail, heading, info, ok, runBoothTask, step } from "#internal/ui";

async function isDir(path: string): Promise<boolean> {
  const result = await capture(["bash", "-lc", `test -d "${path}"`], {
    allowFailure: true,
  });

  return result.exitCode === 0;
}

export async function runRepoCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Sync repository");

  // A booth on releases has no checkout to pull: building into the running
  // release would change it under the apps.
  if ((await lstat(repoRoot).catch(() => undefined))?.isSymbolicLink()) {
    fail(
      `${repoRoot} runs a release, not a checkout. Update it with \`sudo booth update\`.`,
    );
    throw new SilentExit(1);
  }

  // The repo lives under root-owned /opt, so root creates it, then hands it
  // (and anything an earlier root run left in it) to the service user.
  if (isRoot()) {
    await run(["mkdir", "-p", repoRoot]);
    await chownToServiceUser(repoRoot);
  }

  const gitDirExists = await isDir(`${repoRoot}/.git`);

  if (gitDirExists) {
    step(`Pulling latest changes in ${repoRoot}`);
    await run(asServiceUser(["git", "-C", repoRoot, "pull", "--ff-only"]));
  } else {
    step(`Cloning ${REPO_GIT_URL} into ${repoRoot}`);
    await run(asServiceUser(["git", "clone", REPO_GIT_URL, repoRoot]));
  }

  step("Installing workspace dependencies (bun install)");
  await run(serviceBun(["install"]), { cwd: repoRoot });

  step("Building all apps (bun run build)");
  await run(serviceBun(["run", "build"]), { cwd: repoRoot });

  // On arm64 Puppeteer uses the apt Chromium (see puppeteer.config.cjs).
  // `reinstall-puppeteer` would also rewrite package.json and bun.lock, and
  // the next `git pull --ff-only` would refuse to run over them.
  if (detectArch() === "arm64") {
    info("Using the system Chromium for Puppeteer (arm64)");
  } else {
    step("Reinstalling Puppeteer Chrome");
    await run(serviceBun(["run", "reinstall-puppeteer"]), { cwd: repoRoot });
  }

  info(`Repository ready at ${repoRoot}`);
  ok("Repository synced and built");
}

export default defineCommand({
  meta: {
    name: "repo",
    description: "Clone/pull repo, install deps, build, reinstall Puppeteer",
  },
  async run() {
    await runBoothTask(async () => {
      await runRepoCommand(buildBoothContext());
    });
  },
});

import type { CommandContext } from "#internal/context";

import { REPO_GIT_URL } from "#internal/config";
import { capture, run } from "#internal/system";
import { heading, info, ok, step } from "#internal/ui";

async function isDir(path: string): Promise<boolean> {
  const result = await capture(["bash", "-lc", `test -d "${path}"`], {
    allowFailure: true,
  });

  return result.exitCode === 0;
}

export async function repoCommand(context: CommandContext): Promise<void> {
  const { repoRoot } = context;

  heading("Sync repository");

  const gitDirExists = await isDir(`${repoRoot}/.git`);

  if (gitDirExists) {
    step(`Pulling latest changes in ${repoRoot}`);
    await run(["git", "-C", repoRoot, "pull", "--ff-only"]);
  } else {
    step(`Cloning ${REPO_GIT_URL} into ${repoRoot}`);
    await run(["git", "clone", REPO_GIT_URL, repoRoot]);
  }

  step("Installing workspace dependencies (bun install)");
  await run(["bun", "install"], { cwd: repoRoot });

  step("Building all apps (bun run build)");
  await run(["bun", "run", "build"], { cwd: repoRoot });

  step("Reinstalling Puppeteer Chrome");
  await run(["bun", "run", "reinstall-puppeteer"], { cwd: repoRoot });

  info(`Repository ready at ${repoRoot}`);
  ok("Repository synced and built");
}

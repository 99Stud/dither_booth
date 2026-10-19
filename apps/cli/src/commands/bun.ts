import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { SERVICE_BUN, SERVICE_USER } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import {
  asServiceUser,
  capture,
  run,
  serviceBunExists,
} from "#internal/system";
import { heading, info, ok, runBoothTask, step } from "#internal/ui";

export async function runBunCommand(_context: BoothContext): Promise<void> {
  heading("Install Bun");

  if (await serviceBunExists()) {
    const version = await capture([SERVICE_BUN, "--version"], {
      allowFailure: true,
    });
    ok(`Bun already installed (v${version.stdout.trim()})`);
    return;
  }

  step(`Bun not found, installing for ${SERVICE_USER} via official script`);
  await run(
    asServiceUser(["bash", "-c", "curl -fsSL https://bun.sh/install | bash"]),
  );

  info(`Bun installed to ${SERVICE_BUN}.`);
  ok("Bun installed");
}

export default defineCommand({
  meta: {
    name: "bun",
    description: "Install Bun runtime if missing",
  },
  async run() {
    await runBoothTask(async () => {
      await runBunCommand(buildBoothContext());
    });
  },
});

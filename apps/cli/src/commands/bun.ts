import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { buildBoothContext } from "#internal/context";
import { capture, commandExists, run } from "#internal/system";
import { heading, info, ok, runBoothTask, step } from "#internal/ui";

export async function runBunCommand(_context: BoothContext): Promise<void> {
  heading("Install Bun");

  if (await commandExists("bun")) {
    const version = await capture(["bun", "--version"], { allowFailure: true });
    ok(`Bun already installed (v${version.stdout.trim()})`);
    return;
  }

  step("Bun not found, installing via official script");
  await run(["bash", "-lc", "curl -fsSL https://bun.sh/install | bash"]);

  info(
    "Bun installs to ~/.bun/bin. Ensure that directory is on PATH for new shells.",
  );
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

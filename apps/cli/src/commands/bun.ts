import type { CommandContext } from "#internal/context";

import { capture, commandExists, run } from "#internal/system";
import { heading, info, ok, step } from "#internal/ui";

export async function bunCommand(_context: CommandContext): Promise<void> {
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

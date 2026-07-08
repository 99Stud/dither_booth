import type { CommandContext } from "#internal/context";

import { run } from "#internal/system";
import { heading, ok, step } from "#internal/ui";

export async function dbCommand(context: CommandContext): Promise<void> {
  const { repoRoot } = context;

  heading("Apply database migrations");

  // db:migrate also seeds the default print_config row via the API package,
  // so no separate seed step is needed.
  step("Running bun run --filter @dither-booth/api db:migrate");
  await run(["bun", "run", "--filter", "@dither-booth/api", "db:migrate"], {
    cwd: repoRoot,
  });

  ok("Database migrated and seeded");
}

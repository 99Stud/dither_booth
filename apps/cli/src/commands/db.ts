import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { buildBoothContext } from "#internal/context";
import { run } from "#internal/system";
import { heading, ok, runBoothTask, step } from "#internal/ui";

export async function runDbCommand(context: BoothContext): Promise<void> {
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

export default defineCommand({
  meta: {
    name: "db",
    description: "Apply database migrations and seed defaults",
  },
  async run() {
    await runBoothTask(async () => {
      await runDbCommand(buildBoothContext());
    });
  },
});

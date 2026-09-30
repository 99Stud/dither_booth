import type { ArgsDef } from "citty";

import { isRoot } from "#internal/system";
import { fail } from "#internal/ui";

// Shared global flags. Defined on the root command so Citty parses them from
// the full argv before dispatching to a subcommand.
export const globalArgs = {
  yes: {
    type: "boolean",
    alias: "y",
    description: "Assume yes for destructive prompts (non-interactive)",
    default: false,
  },
  color: {
    type: "enum",
    description: "Color output",
    options: ["auto", "always", "never"],
    default: "auto",
  },
  noBanner: {
    type: "boolean",
    description: "Do not print the startup banner",
    default: false,
  },
} as const satisfies ArgsDef;

export function requireRoot(commandName: string): void {
  if (!isRoot()) {
    fail(
      `\`booth ${commandName}\` needs root. Re-run with sudo (e.g. \`sudo booth ${commandName}\`).`,
    );
    // Exit here instead of throwing SilentExit — Citty's setup() path prints
    // thrown errors before our runBoothTask wrapper can map them to a quiet exit.
    process.exit(1);
  }
}

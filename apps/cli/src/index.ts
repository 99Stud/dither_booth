#!/usr/bin/env bun
import { parseArgs } from "node:util";

import type { ColorMode } from "#internal/color";
import type { CommandContext } from "#internal/context";

import { bunCommand } from "#commands/bun";
import { certCommand, certCopyCommand } from "#commands/cert";
import { dbCommand } from "#commands/db";
import { doctorCommand } from "#commands/doctor";
import { installCommand } from "#commands/install";
import { repoCommand } from "#commands/repo";
import { serviceCommand } from "#commands/service";
import { ssdCommand } from "#commands/ssd";
import { printBanner } from "#internal/banner";
import { initColor } from "#internal/color";
import { CLI_VERSION, resolveRepoRoot } from "#internal/config";
import { helpText } from "#internal/help";
import { isRoot, SilentExit } from "#internal/system";
import { fail, plain } from "#internal/ui";

type CommandHandler = (context: CommandContext) => Promise<void>;

const COMMANDS: Record<string, CommandHandler> = {
  install: installCommand,
  bun: bunCommand,
  repo: repoCommand,
  ssd: ssdCommand,
  db: dbCommand,
  cert: certCommand,
  "cert:copy": certCopyCommand,
  service: serviceCommand,
  doctor: doctorCommand,
};

// Commands that write to system locations and require elevated privileges.
const ROOT_COMMANDS = new Set(["install", "ssd", "service"]);

// Commands that show the startup banner before running.
const BANNER_COMMANDS = new Set(["install", "doctor"]);

function parseColorMode(value: string | undefined): ColorMode {
  if (value === "always" || value === "never" || value === "auto") {
    return value;
  }

  return "auto";
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      yes: { type: "boolean", short: "y" },
      color: { type: "string" },
      "no-banner": { type: "boolean" },
    },
  });

  const colorMode = parseColorMode(values.color);
  initColor(colorMode);

  if (values.version) {
    plain(CLI_VERSION);
    return 0;
  }

  const commandName = positionals[0];

  const noBanner =
    Boolean(values["no-banner"]) || Boolean(process.env.BOOTH_NO_BANNER);

  if (values.help) {
    printBanner({ noBanner });
    plain(helpText());
    return 0;
  }

  if (!commandName) {
    printBanner({ noBanner });
    plain(helpText());
    return 1;
  }

  const handler = COMMANDS[commandName];

  if (!handler) {
    printBanner({ noBanner });
    fail(`Unknown command: ${commandName}`);
    plain(helpText());
    return 1;
  }

  if (BANNER_COMMANDS.has(commandName)) {
    printBanner({ noBanner });
  }

  if (ROOT_COMMANDS.has(commandName) && !isRoot()) {
    fail(
      `\`booth ${commandName}\` needs root. Re-run with sudo (e.g. \`sudo booth ${commandName}\`).`,
    );
    return 1;
  }

  const context: CommandContext = {
    repoRoot: resolveRepoRoot(),
    assumeYes: Boolean(values.yes),
    ip: positionals[1],
  };

  await handler(context);

  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    if (error instanceof SilentExit) {
      process.exit(error.exitCode);
    }

    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

import type { CommandDef } from "citty";

import { defineCommand, showUsage } from "citty";

import { globalArgs } from "#internal/args";
import { printBanner } from "#internal/banner";
import { CLI_VERSION } from "#internal/config";
import { getSession, initSession } from "#internal/session";

export const main = defineCommand({
  meta: {
    name: "booth",
    version: CLI_VERSION,
    description: "Dither Booth Raspberry Pi provisioning and management CLI",
  },
  args: globalArgs,
  async setup({ args }) {
    initSession(args);
  },
  subCommands: {
    install: () => import("#commands/install").then((m) => m.default),
    bun: () => import("#commands/bun").then((m) => m.default),
    repo: () => import("#commands/repo").then((m) => m.default),
    ssd: () => import("#commands/ssd").then((m) => m.default),
    db: () => import("#commands/db").then((m) => m.default),
    cert: () => import("#commands/cert").then((m) => m.default),
    service: () => import("#commands/service").then((m) => m.default),
    doctor: () => import("#commands/doctor").then((m) => m.default),
  },
});

export async function showBoothUsage(
  cmd: CommandDef<any>,
  parent?: CommandDef<any>,
): Promise<void> {
  printBanner({ noBanner: getSession().noBanner });
  await showUsage(cmd, parent);
}

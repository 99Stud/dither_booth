import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { runBunCommand } from "#commands/bun";
import { runCertCommand, runCertCopyCommand } from "#commands/cert";
import { runDbCommand } from "#commands/db";
import { runDoctorCommand } from "#commands/doctor";
import { runRepoCommand } from "#commands/repo";
import { runServiceCommand } from "#commands/service";
import { runSsdCommand } from "#commands/ssd";
import { requireRoot } from "#internal/args";
import { printCommandBanner } from "#internal/banner";
import { buildBoothContext } from "#internal/context";
import { run } from "#internal/system";
import { heading, ok, runBoothTask, step, warn } from "#internal/ui";

const APT_PACKAGES = [
  "git",
  "curl",
  "mkcert",
  "libnss3-tools",
  "ca-certificates",
  // Chromium/Puppeteer runtime libraries commonly required on Raspberry Pi OS.
  "libatk1.0-0",
  "libatk-bridge2.0-0",
  "libcups2",
  "libxkbcommon0",
  "libxcomposite1",
  "libxdamage1",
  "libxrandr2",
  "libgbm1",
  "libpango-1.0-0",
  "libasound2",
];

async function aptInstall(): Promise<void> {
  heading("Install system packages");

  step("Updating apt package index");
  await run(["apt-get", "update"], { allowFailure: true });

  step(`Installing: ${APT_PACKAGES.join(", ")}`);
  await run(["apt-get", "install", "-y", ...APT_PACKAGES], {
    allowFailure: true,
  });

  ok("System packages installed");
}

export async function runInstallCommand(context: BoothContext): Promise<void> {
  heading("Dither Booth full install");

  await aptInstall();
  await runBunCommand(context);
  await runRepoCommand(context);
  await runSsdCommand(context);
  await runDbCommand(context);
  await runCertCommand(context);
  await runServiceCommand(context);
  await runCertCopyCommand(context);

  try {
    await runDoctorCommand(context);
  } catch {
    warn("Some health checks did not pass yet. Re-run `booth doctor` shortly.");
  }

  ok("Install complete");
}

export default defineCommand({
  meta: {
    name: "install",
    description: "Full first-time provisioning (runs every setup step)",
  },
  async setup() {
    requireRoot("install");
    printCommandBanner("install");
  },
  async run() {
    await runBoothTask(async () => {
      await runInstallCommand(buildBoothContext());
    });
  },
});

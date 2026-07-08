import type { CommandContext } from "#internal/context";

import { bunCommand } from "#commands/bun";
import { certCommand, certCopyCommand } from "#commands/cert";
import { dbCommand } from "#commands/db";
import { doctorCommand } from "#commands/doctor";
import { repoCommand } from "#commands/repo";
import { serviceCommand } from "#commands/service";
import { ssdCommand } from "#commands/ssd";
import { run } from "#internal/system";
import { heading, ok, step, warn } from "#internal/ui";

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

export async function installCommand(context: CommandContext): Promise<void> {
  heading("Dither Booth full install");

  await aptInstall();
  await bunCommand(context);
  await repoCommand(context);
  await ssdCommand(context);
  await dbCommand(context);
  await certCommand(context);
  await serviceCommand(context);
  await certCopyCommand(context);

  try {
    await doctorCommand(context);
  } catch {
    warn("Some health checks did not pass yet. Re-run `booth doctor` shortly.");
  }

  ok("Install complete");
}

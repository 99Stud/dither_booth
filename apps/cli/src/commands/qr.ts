import {
  getAdminOrigin,
  getLocalOrigins,
  getPort,
  getSetupOrigin,
  getShutterOrigin,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { defineCommand } from "citty";
import { renderUnicodeCompact } from "uqr";

import type { BoothContext } from "#internal/context";

import { buildBoothContext } from "#internal/context";
import { SilentExit } from "#internal/system";
import { command, fail, heading, plain, runBoothTask } from "#internal/ui";

// The same QR the booth prints on its setup ticket, for an operator on SSH.
export async function runQrCommand(context: BoothContext): Promise<void> {
  const repoPathOptions = { repoRoot: context.repoRoot };

  heading("Connect a device");

  const links = await Promise.all([
    getSetupOrigin(repoPathOptions),
    getShutterOrigin(repoPathOptions),
    getAdminOrigin(repoPathOptions),
    getLocalOrigins(repoPathOptions, {
      port: getPort("SETUP_PORT"),
      protocol: "http",
    }),
  ]).catch(() => undefined);

  if (!links) {
    fail(`No certificate yet. Run ${command("booth cert")} first.`);
    throw new SilentExit(1);
  }

  const [setupUrl, shutterOrigin, adminOrigin, [localSetupUrl]] = links;

  plain("Scan with the iPad camera (same Wi-Fi as the booth):");
  plain("");
  plain(renderUnicodeCompact(setupUrl, { border: 2 }));
  plain(`  ${setupUrl}`);
  if (localSetupUrl) plain(`  Page doesn't open? Try ${localSetupUrl}`);
  plain("");
  plain(`  Shutter   ${shutterOrigin}`);
  plain(`  Darkroom  ${new URL(DARKROOM_PATH, shutterOrigin).toString()}`);
  plain(`  Admin     ${adminOrigin}`);
  plain("");
  plain(
    `To trust the booth on a laptop instead: ${command("booth cert copy")}.`,
  );
}

export default defineCommand({
  meta: {
    name: "qr",
    description: "Show the QR code that connects an iPad to the booth",
  },
  async run() {
    await runBoothTask(async () => {
      await runQrCommand(buildBoothContext());
    });
  },
});

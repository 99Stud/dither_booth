/**
 * Test the Shutter, the admin and the Darkroom from a phone on the same
 * network.
 *
 * Prints a QR code to the setup page the Shutter server serves over plain
 * HTTP, where a phone trusts the local certificate and opens the apps.
 */
import {
  getAdminOrigin,
  getSetupOrigin,
  getShutterOrigin,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { renderUnicodeCompact } from "uqr";

import { ENGINE_REPO_ROOT } from "#lib/constants";

const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/engine cert:generate <LAN_IP>";

const repoPathOptions = { repoRoot: ENGINE_REPO_ROOT };
const [setupUrl, adminOrigin, shutterOrigin] = await Promise.all([
  getSetupOrigin(repoPathOptions),
  getAdminOrigin(repoPathOptions),
  getShutterOrigin(repoPathOptions),
]).catch(() => {
  throw new Error(
    `No local certificate yet. Run "${CERT_GENERATE_COMMAND}" first.`,
  );
});

const darkroomUrl = new URL(DARKROOM_PATH, shutterOrigin).toString();

console.log(`
Scan with the phone's camera (same Wi-Fi as this computer):

${renderUnicodeCompact(setupUrl, { border: 2 })}
  ${setupUrl}

  Shutter   ${shutterOrigin}
  Admin     ${adminOrigin}
  Darkroom  ${darkroomUrl}

The page is served by the Shutter server: keep "bun run dev" running.
`);

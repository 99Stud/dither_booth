import { logKioskEvent } from "@dither-booth/logging";
import {
  getAdminOrigin,
  getSetupServerTokenPath,
  getWebTlsHostnames,
} from "@dither-booth/ports";

import { db } from "#db/index";
import { applySqliteMigrations } from "#db/internal/db.migrate";
import { ensureDefaultPrintConfiguration } from "#db/internal/db.seed";
import { createSetupServerAccess } from "#domains/captive/captive.service";
import { PRODUCTION_HUB, readRelease } from "#domains/hub/hub.service";
import { runNmcli } from "#domains/network/network.service";
import {
  createBoothPrinter,
  createPreviewPrinter,
  createUsbPrinterTransport,
} from "#domains/printer/printer.service";
import { createEngine, type Engine } from "#internal/engine";
import { ENGINE_REPO_ROOT } from "#lib/constants";
import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";
import { getRuntimeProcessManager } from "#lib/process-manager/process-manager.utils";
import { createPuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer-lifecycle.utils";
import {
  getHubOverride,
  isReceiptPrintDryRun,
} from "#lib/runtime-flags/runtime-flags";

/**
 * The engine on the booth: the real database, USB printer, Chromium,
 * NetworkManager and Hub, configured from the repo and the environment.
 */
export async function createProductionEngine(options: {
  mode: "development" | "production";
}): Promise<Engine> {
  applySqliteMigrations();
  await ensureDefaultPrintConfiguration();

  // Watched from the start, reconnecting on its own: a printer plugged in
  // after boot is picked up without a restart. In dry run, the preview
  // printer saves tickets as PNGs and never opens USB.
  const printer = isReceiptPrintDryRun()
    ? createPreviewPrinter()
    : createBoothPrinter({ transport: createUsbPrinterTransport() });

  if (printer.dryRun) {
    logKioskEvent(
      "info",
      ENGINE_PRINTER_LOG_SOURCE,
      "receipt-print-dry-run-enabled",
      {
        details: {
          message:
            "RECEIPT_PRINT_DRY_RUN is enabled; tickets are saved as previews, not printed.",
        },
      },
    );
  }

  return createEngine({
    db,
    mode: options.mode,
    printer,
    browser: createPuppeteerReceiptViewerLifecycle(),
    hub: getHubOverride() ?? PRODUCTION_HUB,
    release: readRelease(ENGINE_REPO_ROOT),
    adminOrigin: await getAdminOrigin({ repoRoot: ENGINE_REPO_ROOT }),
    allowedHostnames: await getWebTlsHostnames({ repoRoot: ENGINE_REPO_ROOT }),
    setupServerAccess: await createSetupServerAccess(
      getSetupServerTokenPath({ repoRoot: ENGINE_REPO_ROOT }),
    ),
    processManager: getRuntimeProcessManager(),
    nmcli: runNmcli,
  });
}

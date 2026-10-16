import type { KioskCamera, KioskScreen } from "@dither-booth/shared/kiosk";

import { getShutterOrigin, getWebTlsCaPath } from "@dither-booth/ports";
import {
  ENGINE_HEALTHZ_SERVICE,
  engineHealthzPayloadSchema,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { TRPCError } from "@trpc/server";

import type {
  EngineHealthzPayload,
  PrinterHealthz,
  ShutterHealthz,
} from "#domains/healthz/internal/healthz.types";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";

import { SHUTTER_HEALTHZ_TIMEOUT_MS } from "#domains/healthz/internal/healthz.constants";
import { checkPrinterHealthz } from "#domains/healthz/internal/healthz.printer";
import {
  checkPuppeteerDependency,
  type PuppeteerHealthz,
} from "#domains/healthz/internal/healthz.puppeteer";
import { fetchShutterHealthz } from "#domains/healthz/internal/healthz.utils";
import { serializeKioskMaintenance } from "#domains/kiosk/kiosk.service";
import { darkroomProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

type GetHealthzResponse = {
  shutter: {
    /** Where the Shutter is served, so admin can link to its Darkroom. */
    origin: string;
    healthz: ShutterHealthz;
    kiosk: {
      /** The saved maintenance switch; pages show it once a visit ends. */
      maintenance: { enabled: boolean; updatedAt: string | null };
      /** Kiosk pages subscribed to the kiosk channel right now. */
      pages: Array<{
        pageId: string;
        deviceId: string;
        screen: KioskScreen;
        /** The page's camera as it last reported it; null while it runs none. */
        camera: KioskCamera | null;
        /** Whether the page shows the maintenance screen right now. */
        maintenance: boolean;
        connectedAt: string;
        reportedAt: string | null;
      }>;
    };
  };
  engine: {
    healthz: EngineHealthzPayload;
  };
  puppeteer: PuppeteerHealthz;
  printer: {
    healthz: PrinterHealthz;
  };
  runtime: {
    processManager: RuntimeProcessManager;
  };
};

export const getHealthz = darkroomProcedure.query(async ({ ctx }) => {
  const [shutterOrigin, caPath] = await Promise.all([
    getShutterOrigin({ repoRoot: ENGINE_REPO_ROOT }),
    getWebTlsCaPath({ repoRoot: ENGINE_REPO_ROOT }),
  ]).catch((error) => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve shutter origin or TLS CA.",
      cause: error,
    });
  });

  const ca = Bun.file(caPath);

  const shutterHealthzUrl = new URL("/healthz", shutterOrigin);
  const [shutterHealthz, engineHealthz, puppeteer, printer] = await Promise.all(
    [
      fetchShutterHealthz({
        timeoutMs: SHUTTER_HEALTHZ_TIMEOUT_MS,
        tlsCaFile: ca,
        url: shutterHealthzUrl,
      }),
      Promise.resolve().then(() =>
        engineHealthzPayloadSchema.parse(
          createHealthzPayload({
            mode: ctx.mode,
            service: ENGINE_HEALTHZ_SERVICE,
          }),
        ),
      ),
      checkPuppeteerDependency({
        page: ctx.page,
        state: ctx.puppeteerState,
      }),
      Promise.resolve().then(() => checkPrinterHealthz(ctx.printerUSBAdapter)),
    ],
  );

  const payload = {
    shutter: {
      origin: shutterOrigin,
      healthz: shutterHealthz,
      kiosk: {
        maintenance: serializeKioskMaintenance(ctx.kioskMaintenance.get()),
        pages: ctx.kioskChannel.listPages().map((page) => ({
          pageId: page.pageId,
          deviceId: page.deviceId,
          screen: page.screen,
          camera: page.camera,
          maintenance: page.maintenance,
          connectedAt: page.connectedAt.toISOString(),
          reportedAt: page.reportedAt?.toISOString() ?? null,
        })),
      },
    },
    engine: {
      healthz: engineHealthz,
    },
    puppeteer,
    printer: {
      healthz: printer,
    },
    runtime: {
      processManager: ctx.processManager,
    },
  } satisfies GetHealthzResponse;

  return payload;
});

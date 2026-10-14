import { getWebOrigin, getWebTlsCaPath } from "@dither-booth/ports";
import {
  ENGINE_HEALTHZ_SERVICE,
  engineHealthzPayloadSchema,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { TRPCError } from "@trpc/server";

import type {
  EngineHealthzPayload,
  PrinterHealthz,
  WebHealthz,
} from "#domains/healthz/internal/healthz.types";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";

import { WEB_HEALTHZ_TIMEOUT_MS } from "#domains/healthz/internal/healthz.constants";
import { checkPrinterHealthz } from "#domains/healthz/internal/healthz.printer";
import {
  checkPuppeteerDependency,
  type PuppeteerHealthz,
} from "#domains/healthz/internal/healthz.puppeteer";
import { fetchWebHealthz } from "#domains/healthz/internal/healthz.utils";
import { opsProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

type GetHealthzResponse = {
  web: {
    healthz: WebHealthz;
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

export const getHealthz = opsProcedure.query(async ({ ctx }) => {
  const [webOrigin, caPath] = await Promise.all([
    getWebOrigin({ repoRoot: ENGINE_REPO_ROOT }),
    getWebTlsCaPath({ repoRoot: ENGINE_REPO_ROOT }),
  ]).catch((error) => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve web origin or TLS CA.",
      cause: error,
    });
  });

  const ca = Bun.file(caPath);

  const webHealthzUrl = new URL("/healthz", webOrigin);
  const [webHealthz, engineHealthz, puppeteer, printer] = await Promise.all([
    fetchWebHealthz({
      timeoutMs: WEB_HEALTHZ_TIMEOUT_MS,
      tlsCaFile: ca,
      url: webHealthzUrl,
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
  ]);

  const payload = {
    web: {
      healthz: webHealthz,
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

import { getWebOrigin, getWebTlsCaPath } from "@dither-booth/ports";
import {
  API_HEALTHZ_SERVICE,
  apiHealthzPayloadSchema,
  createHealthzPayload,
} from "@dither-booth/shared/healthz";
import { TRPCError } from "@trpc/server";

import type {
  ApiHealthzPayload,
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
import { publicProcedure } from "#internal/trpc";
import { API_REPO_ROOT } from "#lib/constants";

type GetHealthzResponse = {
  web: {
    healthz: WebHealthz;
  };
  api: {
    healthz: ApiHealthzPayload;
  };
  puppeteer: PuppeteerHealthz;
  printer: {
    healthz: PrinterHealthz;
  };
  runtime: {
    processManager: RuntimeProcessManager;
  };
};

export const getHealthz = publicProcedure.query(async ({ ctx }) => {
  const [webOrigin, caPath] = await Promise.all([
    getWebOrigin({ repoRoot: API_REPO_ROOT }),
    getWebTlsCaPath({ repoRoot: API_REPO_ROOT }),
  ]).catch((error) => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to resolve web origin or TLS CA.",
      cause: error,
    });
  });

  const ca = Bun.file(caPath);

  const webHealthzUrl = new URL("/healthz", webOrigin);
  const [webHealthz, apiHealthz, puppeteer, printer] = await Promise.all([
    fetchWebHealthz({
      timeoutMs: WEB_HEALTHZ_TIMEOUT_MS,
      tlsCaFile: ca,
      url: webHealthzUrl,
    }),
    Promise.resolve().then(() =>
      apiHealthzPayloadSchema.parse(
        createHealthzPayload({
          mode: ctx.mode,
          service: API_HEALTHZ_SERVICE,
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
    api: {
      healthz: apiHealthz,
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

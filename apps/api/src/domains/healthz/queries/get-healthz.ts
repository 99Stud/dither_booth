import type {
  ApiHealthzPayload,
  PrinterDependencyHealthz,
  WebHealthzPayload,
} from "#domains/healthz/internal/healthz.types";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";

import {
  API_HEALTHZ_SERVICE,
  WEB_HEALTHZ_TIMEOUT_MS,
  apiHealthzPayloadSchema,
  webHealthzPayloadSchema,
} from "#domains/healthz/internal/healthz.constants";
import { checkPrinterDependency } from "#domains/healthz/internal/healthz.printer";
import {
  checkPuppeteerDependency,
  type PuppeteerHealthz,
} from "#domains/healthz/internal/healthz.puppeteer";
import {
  createHealthzPayload,
  fetchRemoteHealthzPayload,
} from "#domains/healthz/internal/healthz.utils";
import { publicProcedure } from "#internal/trpc";
import { API_REPO_ROOT } from "#lib/constants";
import { getWebOrigin, getWebTlsCaPath } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";

type GetHealthzResponse = {
  web: {
    healthz: WebHealthzPayload;
  };
  api: {
    healthz: ApiHealthzPayload;
  };
  puppeteer: PuppeteerHealthz;
  printer: {
    healthz: PrinterDependencyHealthz;
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
    fetchRemoteHealthzPayload({
      schema: webHealthzPayloadSchema,
      serviceName: "Web",
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
    Promise.resolve().then(() => checkPrinterDependency(ctx.printerDevice)),
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

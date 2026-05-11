import {
  API_HEALTHZ_SERVICE,
  WEB_HEALTHZ_TIMEOUT_MS,
  apiHealthzPayloadSchema,
  webHealthzPayloadSchema,
} from "#domains/healthz/internal/healthz.constants";
import {
  createHealthzPayload,
  fetchRemoteHealthzPayload,
} from "#domains/healthz/internal/healthz.utils";
import { publicProcedure } from "#internal/trpc";
import { API_REPO_ROOT } from "#lib/constants";
import { getWebOrigin, getWebTlsCaPath } from "@dither-booth/ports";
import { TRPCError } from "@trpc/server";

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
  const webHealthz = await fetchRemoteHealthzPayload({
    schema: webHealthzPayloadSchema,
    serviceName: "Web",
    timeoutMs: WEB_HEALTHZ_TIMEOUT_MS,
    tlsCaFile: ca,
    url: webHealthzUrl,
  });
  const apiHealthz = apiHealthzPayloadSchema.parse(
    createHealthzPayload({
      mode: ctx.mode,
      service: API_HEALTHZ_SERVICE,
    }),
  );

  return {
    web: {
      healthz: webHealthz,
    },
    api: {
      healthz: apiHealthz,
    },
  };
});

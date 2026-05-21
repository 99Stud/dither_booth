import type z from "zod";

import { TRPCError } from "@trpc/server";

import type {
  DependencyHealthzPayload,
  HealthzMode,
  HealthzPayload,
  Timestamped,
} from "./healthz.types";

type HealthzFetch = (
  url: URL,
  init: RequestInit & {
    tls?: {
      ca: ReturnType<typeof Bun.file>[];
    };
  },
) => Promise<Response>;

export function createHealthzPayload<
  const TService extends HealthzPayload["service"],
>({ mode, service }: { mode: HealthzMode; service: TService }) {
  const payload = {
    ok: true,
    service,
    mode,
    timestamp: new Date().toISOString(),
  };

  return payload;
}

export function createDependencyHealthz<
  const TPayload extends DependencyHealthzPayload,
>(payload: TPayload): Timestamped<TPayload> {
  return {
    ...payload,
    timestamp: new Date().toISOString(),
  };
}

export async function fetchRemoteHealthzPayload<
  const TSchema extends z.ZodType,
>({
  fetcher = fetch,
  schema,
  serviceName,
  timeoutMs,
  tlsCaFile,
  url,
}: {
  fetcher?: HealthzFetch;
  schema: TSchema;
  serviceName: "Web" | "API";
  timeoutMs: number;
  tlsCaFile?: Bun.BunFile;
  url: URL;
}): Promise<z.output<TSchema>> {
  const serviceNameLower = serviceName.toLowerCase();

  const healthzRes = await fetcher(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
    ...(tlsCaFile
      ? {
          tls: {
            ca: [tlsCaFile],
          },
        }
      : {}),
  }).catch((error) => {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: timedOut
        ? `${serviceName} health check timed out.`
        : `Failed to reach ${serviceNameLower} health endpoint.`,
      cause: error,
    });
  });

  if (!healthzRes.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `${serviceName} health endpoint returned HTTP ${healthzRes.status}.`,
    });
  }

  const healthzResRaw = await healthzRes.json().catch((error) => {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `${serviceName} health endpoint returned invalid JSON.`,
      cause: error,
    });
  });

  const healthzParsed = schema.safeParse(healthzResRaw);
  if (!healthzParsed.success) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `${serviceName} health endpoint returned unexpected payload.`,
      cause: healthzParsed.error,
    });
  }

  return healthzParsed.data;
}

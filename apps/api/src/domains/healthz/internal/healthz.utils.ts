import { TRPCError } from "@trpc/server";

import type { HealthzMode } from "./healthz.types";

type HealthzPayload<TService extends string> = {
  ok: true;
  service: TService;
  mode: HealthzMode;
  timestamp: string;
};

type HealthzSchema<TPayload> = {
  safeParse: (value: unknown) =>
    | {
        success: true;
        data: TPayload;
      }
    | {
        success: false;
        error: unknown;
      };
};

type HealthzFetch = (
  url: URL,
  init: RequestInit & {
    tls?: {
      ca: ReturnType<typeof Bun.file>[];
    };
  },
) => Promise<Response>;

export function createHealthzPayload<TService extends string>({
  mode,
  service,
}: {
  mode: HealthzMode;
  service: TService;
}): HealthzPayload<TService> {
  return {
    ok: true,
    service,
    mode,
    timestamp: new Date().toISOString(),
  };
}

export async function fetchRemoteHealthzPayload<TPayload>({
  fetcher = fetch,
  schema,
  serviceName,
  timeoutMs,
  tlsCaFile,
  url,
}: {
  fetcher?: HealthzFetch;
  schema: HealthzSchema<TPayload>;
  serviceName: "Web" | "API";
  timeoutMs: number;
  tlsCaFile?: Bun.BunFile;
  url: URL;
}) {
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

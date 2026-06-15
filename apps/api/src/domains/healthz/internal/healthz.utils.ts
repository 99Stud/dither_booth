import type z from "zod";

import { getErrorMessage } from "#lib/misc/misc.utils";

import type {
  DependencyHealthzPayload,
  HealthzError,
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

export function createHealthzError<
  const TContext extends object = Record<string, never>,
>({
  cause,
  context,
  message,
}: {
  cause?: string;
  context?: TContext;
  message: string;
}): HealthzError<TContext> {
  return {
    message,
    ...(cause !== undefined ? { cause } : {}),
    ...(context !== undefined ? { context } : {}),
  };
}

export function createHealthyDependencyHealthz<
  const TDetails extends object = Record<string, never>,
>({ details }: { details?: TDetails } = {}) {
  return createDependencyHealthz({
    ok: true,
    ...(details !== undefined ? { details } : {}),
  });
}

export function createUnhealthyDependencyHealthz<
  const TDetails extends object = Record<string, never>,
  const TContext extends object = Record<string, never>,
>({
  cause,
  context,
  details,
  message,
}: {
  cause?: string;
  context?: TContext;
  details?: TDetails;
  message: string;
}) {
  return createDependencyHealthz({
    ok: false,
    message,
    error: createHealthzError({
      ...(cause !== undefined ? { cause } : {}),
      ...(context !== undefined ? { context } : {}),
      message,
    }),
    ...(details !== undefined ? { details } : {}),
  });
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
}) {
  const serviceNameLower = serviceName.toLowerCase();

  let healthzRes: Response;

  try {
    healthzRes = await fetcher(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      ...(tlsCaFile
        ? {
            tls: {
              ca: [tlsCaFile],
            },
          }
        : {}),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    const message = timedOut
      ? `${serviceName} health check timed out.`
      : `Failed to reach ${serviceNameLower} health endpoint.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(error),
      context: {
        service: serviceNameLower,
        timeoutMs,
        url: url.toString(),
      },
      details: {
        service: serviceNameLower,
        url: url.toString(),
      },
      message,
    });
  }

  if (!healthzRes.ok) {
    const message = `${serviceName} health endpoint returned HTTP ${healthzRes.status}.`;

    return createUnhealthyDependencyHealthz({
      context: {
        service: serviceNameLower,
        status: healthzRes.status,
        url: url.toString(),
      },
      details: {
        service: serviceNameLower,
        status: healthzRes.status,
        url: url.toString(),
      },
      message,
    });
  }

  let healthzResRaw: unknown;

  try {
    healthzResRaw = await healthzRes.json();
  } catch (error) {
    const message = `${serviceName} health endpoint returned invalid JSON.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(error),
      context: {
        service: serviceNameLower,
        url: url.toString(),
      },
      details: {
        service: serviceNameLower,
        url: url.toString(),
      },
      message,
    });
  }

  const healthzParsed = schema.safeParse(healthzResRaw);
  if (!healthzParsed.success) {
    const message = `${serviceName} health endpoint returned unexpected payload.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(healthzParsed.error),
      context: {
        service: serviceNameLower,
        url: url.toString(),
      },
      details: {
        service: serviceNameLower,
        url: url.toString(),
      },
      message,
    });
  }

  return healthzParsed.data as z.output<TSchema>;
}

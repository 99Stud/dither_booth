import { getErrorMessage } from "@dither-booth/shared/errors";
import {
  WEB_HEALTHZ_SERVICE,
  webHealthzPayloadSchema,
} from "@dither-booth/shared/healthz";
import { fetch } from "bun";

import type {
  DependencyHealthzPayload,
  HealthzError,
  Timestamped,
} from "./healthz.types";

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

export async function fetchWebHealthz({
  timeoutMs,
  tlsCaFile,
  url,
}: {
  timeoutMs: number;
  tlsCaFile?: Bun.BunFile;
  url: URL;
}) {
  let healthzRes: Response;

  try {
    healthzRes = await fetch(url, {
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
      ? `Web app server health check timed out.`
      : `Failed to reach web app server health endpoint.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(error),
      context: {
        service: WEB_HEALTHZ_SERVICE,
        timeoutMs,
        url: url.toString(),
      },
      details: {
        service: WEB_HEALTHZ_SERVICE,
        url: url.toString(),
      },
      message,
    });
  }

  if (!healthzRes.ok) {
    const message = `Web app server health endpoint returned HTTP ${healthzRes.status}.`;

    return createUnhealthyDependencyHealthz({
      context: {
        service: WEB_HEALTHZ_SERVICE,
        status: healthzRes.status,
        url: url.toString(),
      },
      details: {
        service: WEB_HEALTHZ_SERVICE,
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
    const message = `Web app server health endpoint returned invalid JSON.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(error),
      context: {
        service: WEB_HEALTHZ_SERVICE,
        url: url.toString(),
      },
      details: {
        service: WEB_HEALTHZ_SERVICE,
        url: url.toString(),
      },
      message,
    });
  }

  const healthzParsed = webHealthzPayloadSchema.safeParse(healthzResRaw);
  if (!healthzParsed.success) {
    const message = `Web app server health endpoint returned unexpected payload.`;

    return createUnhealthyDependencyHealthz({
      cause: getErrorMessage(healthzParsed.error),
      context: {
        service: WEB_HEALTHZ_SERVICE,
        url: url.toString(),
      },
      details: {
        service: WEB_HEALTHZ_SERVICE,
        url: url.toString(),
      },
      message,
    });
  }

  return healthzParsed.data;
}

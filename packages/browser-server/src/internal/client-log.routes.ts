import { logKioskEvent } from "@dither-booth/logging";
import {
  CLIENT_LOG_MAX_BODY_BYTES,
  CLIENT_LOG_RATE_LIMIT,
  CLIENT_LOG_RATE_WINDOW_MS,
  type ClientLogReport,
  clientLogReportSchema,
} from "@dither-booth/logging/client-log";
import { isAllowedConfiguredOrigin } from "@dither-booth/ports/origin";

import type { RouteHandler } from "./browser-server.types";

/**
 * Reads at most `maxBytes` of the body. Returns `null` as soon as the body
 * is longer, so an oversized report is never held in memory whole.
 */
async function readBodyWithLimit(req: Request, maxBytes: number) {
  const declaredLength = Number(req.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return null;
  }

  if (!req.body) {
    return "";
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    length += value.byteLength;

    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Counts reports per device and level in fixed windows: warnings and errors
 * have their own budgets, so a warning loop can't crowd out errors. Windows
 * that have ended are dropped on the next report, so the map holds only
 * devices seen recently.
 */
function createDeviceRateLimiter(now: () => number) {
  const windows = new Map<string, { count: number; startedAt: number }>();

  return (deviceId: string, level: ClientLogReport["level"]) => {
    const key = JSON.stringify([deviceId, level]);
    const time = now();

    for (const [id, window] of windows) {
      if (time - window.startedAt >= CLIENT_LOG_RATE_WINDOW_MS) {
        windows.delete(id);
      }
    }

    const window = windows.get(key) ?? { count: 0, startedAt: time };

    if (window.count >= CLIENT_LOG_RATE_LIMIT) {
      return false;
    }

    window.count += 1;
    windows.set(key, window);
    return true;
  };
}

/**
 * The write-only browser report route. A browser's warning or error, sent
 * with a beacon, is re-logged on this server's own log marked
 * `origin: "browser"`. Refused, and never logged: a foreign origin (403), a
 * body over 16 KB (413), an invalid report (400), and a device's reports
 * past 30 a minute per level (429).
 */
export function createClientLogRoute({
  allowedHostnames = [],
  now = Date.now,
  publicOrigin,
}: {
  allowedHostnames?: readonly string[];
  now?: () => number;
  publicOrigin: string;
}): RouteHandler {
  const takeDeviceReport = createDeviceRateLimiter(now);

  return async (req) => {
    if (req.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }

    if (
      !isAllowedConfiguredOrigin(
        req.headers.get("origin") ?? undefined,
        publicOrigin,
        allowedHostnames,
      )
    ) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    const body = await readBodyWithLimit(req, CLIENT_LOG_MAX_BODY_BYTES);

    if (body === null) {
      return new Response("Report too large.", { status: 413 });
    }

    const report = clientLogReportSchema.safeParse(parseJson(body));

    if (!report.success) {
      return new Response("Invalid report.", { status: 400 });
    }

    const { deviceId, details, error, event, level, runId, source } =
      report.data;

    if (!takeDeviceReport(deviceId, level)) {
      return new Response("Too many reports.", { status: 429 });
    }

    logKioskEvent(level, source, event, {
      browser: { deviceId, runId },
      ...(details ? { details } : {}),
      ...(error ? { error } : {}),
    });

    return new Response(null, { status: 204 });
  };
}

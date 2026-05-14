import type {
  BrowserServerWebSocket,
  BrowserServerWebSocketMessage,
} from "@dither-booth/browser-server/internal/browser-server.types";

import { randomUUIDv7 } from "bun";

import type {
  Pm2RestartProcessStatus,
  Pm2RestartProgressEvent,
  Pm2RestartService,
  RestartLogContext,
} from "./pm2-control.types";

import {
  PM2_RESTART_CLOSE_REASON_MAX_BYTES,
  pm2RestartProcessStatusSchema,
} from "./pm2-control.constants";

export function sendRestartEvent(
  ws: BrowserServerWebSocket,
  event: Pm2RestartProgressEvent,
) {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // The restart should continue even if the browser disconnects mid-progress.
  }
}

export function isPm2ManagedRuntime() {
  return Bun.env.PROCESS_MANAGER === "pm2";
}

const NUL_CHAR = String.fromCharCode(0);

export function getWebSocketCloseReason(reason: string) {
  const normalizedReason =
    reason
      .replaceAll(NUL_CHAR, "\n")
      .replace(/[^\S ]+/g, " ")
      .trim() || "PM2 restart failed.";
  const encoder = new TextEncoder();

  if (
    encoder.encode(normalizedReason).length <=
    PM2_RESTART_CLOSE_REASON_MAX_BYTES
  ) {
    return normalizedReason;
  }

  const suffix = "...";
  let truncatedReason = "";

  for (const char of normalizedReason) {
    const candidate = `${truncatedReason}${char}${suffix}`;

    if (encoder.encode(candidate).length > PM2_RESTART_CLOSE_REASON_MAX_BYTES) {
      break;
    }

    truncatedReason += char;
  }

  return `${truncatedReason}${suffix}`;
}

export function parseRestartMessage(message: BrowserServerWebSocketMessage) {
  const text = typeof message === "string" ? message : message.toString();

  return JSON.parse(text) as unknown;
}

export function isPm2RestartProcessStatus(
  status: unknown,
): status is Pm2RestartProcessStatus {
  return pm2RestartProcessStatusSchema.safeParse(status).success;
}

export function createRestartLogContext(
  service: Pm2RestartService,
): RestartLogContext {
  return {
    restartId: randomUUIDv7(),
    service,
    startedAtMs: Date.now(),
  };
}

export function getRestartElapsedMs(context: RestartLogContext) {
  return Math.max(0, Date.now() - context.startedAtMs);
}

export function getRestartLogDetails(
  context: RestartLogContext,
  processName?: string,
) {
  return {
    durationMs: getRestartElapsedMs(context),
    processName,
    restartId: context.restartId,
    service: context.service,
    startedAt: new Date(context.startedAtMs).toISOString(),
  };
}

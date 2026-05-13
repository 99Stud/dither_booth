import type {
  Pm2RestartProgressEvent,
  Pm2RestartResult,
  Pm2RestartService,
} from "#lib/pm2/pm2-control.types";
import type { useTRPC } from "#lib/trpc/trpc.utils";
import type { inferOutput } from "@trpc/tanstack-react-query";

import {
  PM2_RESTART_ROUTE_PATH,
  pm2RestartProgressEventSchema,
} from "#lib/pm2/pm2-control.constants";

import { PM2_RESTART_WEBSOCKET_TIMEOUT_MS } from "./HealthCard.constants";

export const extractUnhealthyServices = (
  healthz: inferOutput<ReturnType<typeof useTRPC>["getHealthz"]>,
) => {
  const unhealthyServices = [];

  if (!healthz.web.healthz.ok) {
    unhealthyServices.push("web");
  }

  if (!healthz.api.healthz.ok) {
    unhealthyServices.push("api");
  }

  return unhealthyServices;
};

function getPm2RestartWebSocketUrl() {
  const url = new URL(PM2_RESTART_ROUTE_PATH, window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  return url;
}

function parseRestartEvent(
  data: MessageEvent["data"],
): Pm2RestartProgressEvent {
  if (typeof data !== "string") {
    throw new Error("Invalid PM2 restart progress event.");
  }

  return pm2RestartProgressEventSchema.parse(JSON.parse(data));
}

export async function requestPm2ServiceRestart({
  onProgress,
  service,
  timeoutMs = PM2_RESTART_WEBSOCKET_TIMEOUT_MS,
}: {
  onProgress?: (event: Pm2RestartProgressEvent) => void;
  service: Pm2RestartService;
  timeoutMs?: number;
}): Promise<Pm2RestartResult> {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(getPm2RestartWebSocketUrl());
    let didClose = false;
    let didSettle = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const resolveOnce = (result: Pm2RestartResult) => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      cleanup();
      resolve(result);
    };

    const rejectOnce = (error: Error) => {
      if (didSettle) {
        return;
      }

      didSettle = true;
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
      ws.removeEventListener("close", onClose);

      if (!didClose) {
        ws.close();
      }
    };

    const onOpen = () => {
      ws.send(JSON.stringify({ service }));
    };

    const onMessage = (message: MessageEvent) => {
      let restartEvent: Pm2RestartProgressEvent;

      try {
        restartEvent = parseRestartEvent(message.data);
      } catch (error) {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      onProgress?.(restartEvent);

      if (restartEvent.type === "completed") {
        resolveOnce(restartEvent.result);
        return;
      }

      if (restartEvent.type === "failed") {
        rejectOnce(new Error(restartEvent.message));
      }
    };

    const onError = () => {
      rejectOnce(new Error("Failed to connect to PM2 restart stream."));
    };

    const onClose = (event: CloseEvent) => {
      didClose = true;

      if (didSettle) {
        return;
      }

      rejectOnce(
        new Error(event.reason || "PM2 restart stream closed unexpectedly."),
      );
    };

    timeout = setTimeout(() => {
      rejectOnce(new Error("Timed out waiting for PM2 restart."));
    }, timeoutMs);

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);
  });
}

export const getRestartProgressLabel = (
  progressEvent: Pm2RestartProgressEvent | undefined,
  serviceLabel: string,
) => {
  switch (progressEvent?.type) {
    case "accepted":
      return `Starting ${serviceLabel} restart`;
    case "resolving-process":
      return "Resolving PM2 process";
    case "connecting":
      return "Connecting to PM2";
    case "restarting":
      return `Restarting ${serviceLabel}`;
    case "disconnecting":
      return "Disconnecting from PM2";
    case "completed":
      return `${serviceLabel} restarted`;
    case "failed":
      return `${serviceLabel} restart failed`;
    default:
      return `Restarting ${serviceLabel}`;
  }
};

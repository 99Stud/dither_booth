import type {
  BrowserServerWebSocket,
  BrowserServerWebSocketMessage,
  WebSocketRouteHandler,
} from "@dither-booth/browser-server/internal/browser-server.types";

import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import { sleep } from "@dither-booth/ui/lib/utils";

import { ADMIN_PM2_CONTROL_LOG_SOURCE } from "#lib/constants";

import type {
  Pm2RestartFailureCode,
  Pm2RestartResult,
  Pm2RestartService,
  ReconcileRestartStatus,
  RestartLogContext,
  RestartPm2Service,
} from "./pm2-control.types";

import {
  PM2_RESTART_IDLE_TIMEOUT_MS,
  PM2_RESTART_INTERNAL_ERROR_CLOSE_CODE,
  PM2_RESTART_INVALID_CLOSE_CODE,
  PM2_RESTART_TIMEOUT_SAFETY_MS,
  PM2_RESTART_UNKNOWN_STATE_GUARD_MS,
  pm2RestartRequestSchema,
} from "./pm2-control.constants";
import {
  Pm2RestartTimeoutError,
  getPm2RestartFailureDetails,
  getPm2RestartProcessStatus,
  restartPm2Service,
} from "./pm2-control.server";
import {
  createRestartLogContext,
  getRestartLogDetails,
  getWebSocketCloseReason,
  isPm2RestartProcessStatus,
  parseRestartMessage,
  sendRestartEvent,
} from "./pm2-control.utils";

async function waitForRestartTimeoutSafety(
  error: Pm2RestartTimeoutError,
  timeoutSafetyMs: number,
): Promise<
  | { type: "completed"; result: Pm2RestartResult }
  | { type: "failed"; error: unknown }
  | { type: "pending" }
> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const outcome = await Promise.race([
      error.completion
        .then(() => "completed" as const)
        .catch((completionError: unknown) => ({
          error: completionError,
          type: "failed" as const,
        })),
      new Promise<"pending">((resolve) => {
        timeout = setTimeout(() => {
          resolve("pending");
        }, timeoutSafetyMs);
      }),
    ]);

    if (outcome === "completed") {
      return {
        type: "completed",
        result: {
          ok: true,
          processName: error.processName,
          restartedAt: new Date().toISOString(),
          service: error.service,
        },
      };
    }

    if (outcome === "pending") {
      return {
        type: "pending",
      };
    }

    return outcome;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function createPm2RestartRoute({
  idleTimeoutMs = PM2_RESTART_IDLE_TIMEOUT_MS,
  reconcileRestartStatus = ({ processName }) =>
    getPm2RestartProcessStatus({ processName }),
  restartService = restartPm2Service,
  restartTimeoutSafetyMs = PM2_RESTART_TIMEOUT_SAFETY_MS,
  unknownStateGuardMs = PM2_RESTART_UNKNOWN_STATE_GUARD_MS,
}: {
  idleTimeoutMs?: number;
  reconcileRestartStatus?: ReconcileRestartStatus;
  restartService?: RestartPm2Service;
  restartTimeoutSafetyMs?: number;
  unknownStateGuardMs?: number;
} = {}): WebSocketRouteHandler {
  const activeSockets = new WeakSet<BrowserServerWebSocket>();
  const idleTimers = new WeakMap<
    BrowserServerWebSocket,
    ReturnType<typeof setTimeout>
  >();
  // This lock is process-local; PM2 must keep the admin app at one instance.
  let activeRestartService: Pm2RestartService | undefined;

  const clearIdleTimer = (ws: BrowserServerWebSocket) => {
    const timer = idleTimers.get(ws);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    idleTimers.delete(ws);
  };

  const closeRestartSocket = (
    ws: BrowserServerWebSocket,
    code: number,
    reason: string,
  ) => {
    clearIdleTimer(ws);
    ws.close(code, getWebSocketCloseReason(reason));
  };

  const failAndClose = ({
    code,
    closeCode,
    message,
    processName,
    service,
    ws,
  }: {
    code: Pm2RestartFailureCode;
    closeCode: number;
    message: string;
    processName?: string;
    service?: Pm2RestartService;
    ws: BrowserServerWebSocket;
  }) => {
    sendRestartEvent(ws, {
      type: "failed",
      code,
      error: message,
      message,
      processName,
      service,
    });
    closeRestartSocket(ws, closeCode, message);
  };

  const completeAndClose = (
    ws: BrowserServerWebSocket,
    result: Pm2RestartResult,
  ) => {
    sendRestartEvent(ws, {
      type: "completed",
      result,
      service: result.service,
      processName: result.processName,
      message: `${result.processName} restarted.`,
    });
    closeRestartSocket(ws, 1000, "PM2 restart completed.");
  };

  const logRestartStarted = (context: RestartLogContext) => {
    logKioskEvent("info", ADMIN_PM2_CONTROL_LOG_SOURCE, "pm2-restart-started", {
      details: getRestartLogDetails(context),
    });
  };

  const logRestartCompleted = (
    context: RestartLogContext,
    result: Pm2RestartResult,
  ) => {
    logKioskEvent(
      "info",
      ADMIN_PM2_CONTROL_LOG_SOURCE,
      "pm2-restart-completed",
      {
        details: getRestartLogDetails(context, result.processName),
      },
    );
  };

  const logRestartFailed = (
    error: unknown,
    context: RestartLogContext,
    processName?: string,
  ) => {
    const details = getPm2RestartFailureDetails(error, context.service);

    logKioskEvent("error", ADMIN_PM2_CONTROL_LOG_SOURCE, "pm2-restart-failed", {
      details: {
        ...getRestartLogDetails(context, processName ?? details.processName),
        failureCode: details.code,
        service: details.service ?? context.service,
      },
      error: getKioskErrorDiagnostics(error, "PM2 restart failed."),
    });
  };

  const failFromError = (
    ws: BrowserServerWebSocket,
    error: unknown,
    service: Pm2RestartService,
  ) => {
    const details = getPm2RestartFailureDetails(error, service);

    failAndClose({
      code: details.code,
      closeCode: PM2_RESTART_INTERNAL_ERROR_CLOSE_CODE,
      message: details.message,
      processName: details.processName,
      service: details.service,
      ws,
    });
  };

  const handleRestartTimeout = async (
    ws: BrowserServerWebSocket,
    error: Pm2RestartTimeoutError,
    context: RestartLogContext,
  ) => {
    const safetyOutcome = await waitForRestartTimeoutSafety(
      error,
      restartTimeoutSafetyMs,
    );

    if (safetyOutcome.type === "completed") {
      logRestartCompleted(context, safetyOutcome.result);
      completeAndClose(ws, safetyOutcome.result);
      return;
    }

    if (safetyOutcome.type === "failed") {
      logRestartFailed(safetyOutcome.error, context);
      failFromError(ws, safetyOutcome.error, error.service);
      return;
    }

    const status = await reconcileRestartStatus({
      processName: error.processName,
      service: error.service,
    }).catch((statusError: unknown) => statusError);

    if (!isPm2RestartProcessStatus(status)) {
      logRestartFailed(status, context, error.processName);
      failAndClose({
        code: "pm2-status-unknown",
        closeCode: PM2_RESTART_INTERNAL_ERROR_CLOSE_CODE,
        message: "PM2 restart status unknown. Check PM2 before retrying.",
        processName: error.processName,
        service: error.service,
        ws,
      });
      await sleep(unknownStateGuardMs);
      return;
    }

    const statusMessage = status.exists
      ? `Timed out restarting ${error.processName}. Current PM2 status: ${
          status.status ?? "unknown"
        }.`
      : `Timed out restarting ${error.processName}. PM2 process not found.`;

    logRestartFailed(error, context, error.processName);
    failAndClose({
      code: "pm2-restart-timeout",
      closeCode: PM2_RESTART_INTERNAL_ERROR_CLOSE_CODE,
      message: statusMessage,
      processName: error.processName,
      service: error.service,
      ws,
    });
  };

  const handleRestartMessage = async (
    ws: BrowserServerWebSocket,
    message: BrowserServerWebSocketMessage,
  ) => {
    if (activeSockets.has(ws)) {
      failAndClose({
        code: "restart-in-progress",
        closeCode: PM2_RESTART_INVALID_CLOSE_CODE,
        message: "Restart already in progress.",
        ws,
      });
      return;
    }

    const body = (() => {
      try {
        return parseRestartMessage(message);
      } catch {
        return undefined;
      }
    })();
    const parsed = pm2RestartRequestSchema.safeParse(body);

    if (!parsed.success) {
      failAndClose({
        code: "invalid-request",
        closeCode: PM2_RESTART_INVALID_CLOSE_CODE,
        message: "Invalid PM2 restart request.",
        ws,
      });
      return;
    }

    clearIdleTimer(ws);

    if (activeRestartService !== undefined) {
      failAndClose({
        code: "restart-in-progress",
        closeCode: PM2_RESTART_INVALID_CLOSE_CODE,
        message: "Restart already in progress.",
        service: parsed.data.service,
        ws,
      });
      return;
    }

    activeSockets.add(ws);

    const { service } = parsed.data;
    activeRestartService = service;
    const restartContext = createRestartLogContext(service);

    try {
      sendRestartEvent(ws, {
        type: "accepted",
        service,
        message: "PM2 restart request accepted.",
      });

      logRestartStarted(restartContext);

      const result = await restartService({
        onProgress: (event) => {
          sendRestartEvent(ws, event);
        },
        service,
      });

      logRestartCompleted(restartContext, result);

      completeAndClose(ws, result);
    } catch (error) {
      if (error instanceof Pm2RestartTimeoutError) {
        await handleRestartTimeout(ws, error, restartContext);
        return;
      }

      logRestartFailed(error, restartContext);
      failFromError(ws, error, service);
    } finally {
      activeRestartService = undefined;
      activeSockets.delete(ws);
    }
  };

  return {
    open: (ws) => {
      const timer = setTimeout(() => {
        failAndClose({
          code: "invalid-request",
          closeCode: PM2_RESTART_INVALID_CLOSE_CODE,
          message: "PM2 restart request timed out.",
          ws,
        });
      }, idleTimeoutMs);

      idleTimers.set(ws, timer);
    },
    message: (ws, message) => {
      void handleRestartMessage(ws, message);
    },
    close: (ws) => {
      clearIdleTimer(ws);
      activeSockets.delete(ws);
    },
  };
}

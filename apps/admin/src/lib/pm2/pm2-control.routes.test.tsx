import type {
  BrowserServerWebSocket,
  BrowserServerWebSocketData,
} from "@dither-booth/browser-server/internal/browser-server.types";

import { createWebSocketUpgradeRoute } from "@dither-booth/browser-server/internal/browser-server.utils";
import { describe, expect, it } from "bun:test";

import type {
  Pm2RestartProgressEvent,
  Pm2RestartResult,
} from "./pm2-control.types";

import {
  PM2_RESTART_CLOSE_REASON_MAX_BYTES,
  PM2_RESTART_ROUTE_PATH,
} from "./pm2-control.constants";
import { createPm2RestartRoute } from "./pm2-control.routes";
import {
  Pm2RestartOperationError,
  Pm2RestartTimeoutError,
} from "./pm2-control.server";

async function flushAsyncRoute() {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function createTestSocket() {
  const sentEvents: Pm2RestartProgressEvent[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];
  const socket = {
    close: (code?: number, reason?: string) => {
      closes.push({ code, reason });
    },
    send: (message: string) => {
      sentEvents.push(JSON.parse(message) as Pm2RestartProgressEvent);
      return message.length;
    },
  } as unknown as BrowserServerWebSocket;

  return {
    closes,
    sentEvents,
    socket,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

const BunWebSocket = WebSocket as unknown as {
  new (
    url: string,
    options: {
      headers: Record<string, string>;
    },
  ): WebSocket;
};

function createRestartWebSocketServer(
  route: ReturnType<typeof createPm2RestartRoute>,
) {
  return Bun.serve({
    port: 0,
    routes: {
      [PM2_RESTART_ROUTE_PATH]: createWebSocketUpgradeRoute({
        handler: route,
        publicOrigin: "https://admin.local",
        routePath: PM2_RESTART_ROUTE_PATH,
      }),
    },
    websocket: {
      data: {} as BrowserServerWebSocketData,
      open: (ws) => {
        void route.open?.(ws);
      },
      message: (ws, message) => {
        void route.message?.(ws, message);
      },
      close: (ws, code, reason) => {
        void route.close?.(ws, code, reason);
      },
    },
  });
}

async function requestRestartFromRealWebSocket({
  port,
  service = "web",
}: {
  port: number;
  service?: "api" | "web";
}) {
  return await new Promise<{
    closeCode: number;
    closeReason: string;
    events: Pm2RestartProgressEvent[];
  }>((resolve, reject) => {
    const events: Pm2RestartProgressEvent[] = [];
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for restart WebSocket test."));
    }, 1000);
    const ws = new BunWebSocket(
      `ws://127.0.0.1:${port}${PM2_RESTART_ROUTE_PATH}`,
      {
        headers: {
          Origin: "https://admin.local",
        },
      },
    );

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ service }));
    });
    ws.addEventListener("message", (event) => {
      events.push(JSON.parse(String(event.data)) as Pm2RestartProgressEvent);
    });
    ws.addEventListener("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    ws.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve({
        closeCode: event.code,
        closeReason: event.reason,
        events,
      });
    });
  });
}

describe("createPm2RestartRoute", () => {
  it("restarts a valid service over websocket messages", async () => {
    const result: Pm2RestartResult = {
      ok: true,
      processName: "dither-booth-web",
      restartedAt: "2026-05-12T00:00:00.000Z",
      service: "web",
    };
    const route = createPm2RestartRoute({
      restartService: async ({ onProgress, service }) => {
        await onProgress?.({
          type: "resolving-process",
          service,
          message: "Resolving PM2 process name.",
        });

        return result;
      },
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "web" }));
    await flushAsyncRoute();

    expect(sentEvents.map((event) => event.type)).toEqual([
      "accepted",
      "resolving-process",
      "completed",
    ]);
    expect(closes).toEqual([
      {
        code: 1000,
        reason: "PM2 restart completed.",
      },
    ]);
  });

  it("rejects invalid services", () => {
    const route = createPm2RestartRoute();
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "admin" }));

    expect(sentEvents).toEqual([
      {
        type: "failed",
        code: "invalid-request",
        error: "Invalid PM2 restart request.",
        message: "Invalid PM2 restart request.",
      },
    ]);
    expect(closes).toEqual([
      {
        code: 1008,
        reason: "Invalid PM2 restart request.",
      },
    ]);
  });

  it("rejects malformed messages", () => {
    const route = createPm2RestartRoute();
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, "not-json");

    expect(sentEvents).toEqual([
      {
        type: "failed",
        code: "invalid-request",
        error: "Invalid PM2 restart request.",
        message: "Invalid PM2 restart request.",
      },
    ]);
    expect(closes).toEqual([
      {
        code: 1008,
        reason: "Invalid PM2 restart request.",
      },
    ]);
  });

  it("clears idle timers after invalid restart messages", async () => {
    const route = createPm2RestartRoute({
      idleTimeoutMs: 1,
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.open?.(socket);
    route.message?.(socket, "not-json");
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(sentEvents).toEqual([
      {
        type: "failed",
        code: "invalid-request",
        error: "Invalid PM2 restart request.",
        message: "Invalid PM2 restart request.",
      },
    ]);
    expect(closes).toEqual([
      {
        code: 1008,
        reason: "Invalid PM2 restart request.",
      },
    ]);
  });

  it("rejects duplicate restart messages on the same socket", async () => {
    const result = createDeferred<Pm2RestartResult>();
    const route = createPm2RestartRoute({
      restartService: () => result.promise,
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "web" }));
    route.message?.(socket, JSON.stringify({ service: "web" }));
    await flushAsyncRoute();

    expect(sentEvents).toContainEqual({
      type: "failed",
      code: "restart-in-progress",
      error: "Restart already in progress.",
      message: "Restart already in progress.",
    });
    expect(closes).toContainEqual({
      code: 1008,
      reason: "Restart already in progress.",
    });

    result.resolve({
      ok: true,
      processName: "dither-booth-web",
      restartedAt: "2026-05-12T00:00:00.000Z",
      service: "web",
    });
    await flushAsyncRoute();
  });

  it("rejects concurrent restarts from another socket", async () => {
    const result = createDeferred<Pm2RestartResult>();
    const route = createPm2RestartRoute({
      restartService: () => result.promise,
    });
    const first = createTestSocket();
    const second = createTestSocket();

    route.message?.(first.socket, JSON.stringify({ service: "web" }));
    route.message?.(second.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(second.sentEvents).toEqual([
      {
        type: "failed",
        code: "restart-in-progress",
        error: "Restart already in progress.",
        message: "Restart already in progress.",
        service: "api",
      },
    ]);
    expect(second.closes).toEqual([
      {
        code: 1008,
        reason: "Restart already in progress.",
      },
    ]);

    result.resolve({
      ok: true,
      processName: "dither-booth-web",
      restartedAt: "2026-05-12T00:00:00.000Z",
      service: "web",
    });
    await flushAsyncRoute();
  });

  it("releases the restart lock after failures", async () => {
    let attempts = 0;
    const route = createPm2RestartRoute({
      restartService: async ({ service }) => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("restart failed");
        }

        return {
          ok: true,
          processName: `dither-booth-${service}`,
          restartedAt: "2026-05-12T00:00:00.000Z",
          service,
        };
      },
    });
    const first = createTestSocket();
    const second = createTestSocket();

    route.message?.(first.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();
    route.message?.(second.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(first.closes).toContainEqual({
      code: 1011,
      reason: "Failed to restart PM2 process.",
    });
    expect(second.closes).toContainEqual({
      code: 1000,
      reason: "PM2 restart completed.",
    });
  });

  it("closes idle sockets that never send a restart request", async () => {
    const route = createPm2RestartRoute({
      idleTimeoutMs: 1,
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.open?.(socket);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(sentEvents).toEqual([
      {
        type: "failed",
        code: "invalid-request",
        error: "PM2 restart request timed out.",
        message: "PM2 restart request timed out.",
      },
    ]);
    expect(closes).toEqual([
      {
        code: 1008,
        reason: "PM2 restart request timed out.",
      },
    ]);
  });

  it("sends a failed event when restart fails", async () => {
    const route = createPm2RestartRoute({
      restartService: async () => {
        throw new Error("restart failed");
      },
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(sentEvents).toEqual([
      {
        type: "accepted",
        service: "api",
        message: "PM2 restart request accepted.",
      },
      {
        type: "failed",
        code: "pm2-restart-failed",
        error: "Failed to restart PM2 process.",
        message: "Failed to restart PM2 process.",
        service: "api",
      },
    ]);
    expect(closes).toEqual([
      {
        code: 1011,
        reason: "Failed to restart PM2 process.",
      },
    ]);
  });

  it("reports late timeout completion inside the safety window as success", async () => {
    const completion = createDeferred<void>();
    const route = createPm2RestartRoute({
      restartService: async ({ service }) => {
        throw new Pm2RestartTimeoutError({
          completion: completion.promise,
          message: "Timed out restarting dither-booth-web.",
          processName: "dither-booth-web",
          service,
        });
      },
      restartTimeoutSafetyMs: 30,
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "web" }));
    await flushAsyncRoute();
    completion.resolve(undefined);
    await flushAsyncRoute();

    expect(sentEvents.map((event) => event.type)).toEqual([
      "accepted",
      "completed",
    ]);
    expect(closes).toEqual([
      {
        code: 1000,
        reason: "PM2 restart completed.",
      },
    ]);
  });

  it("reports late timeout rejection inside the safety window as failure", async () => {
    const completion = createDeferred<void>();
    const route = createPm2RestartRoute({
      restartService: async ({ service }) => {
        throw new Pm2RestartTimeoutError({
          completion: completion.promise,
          message: "Timed out restarting dither-booth-web.",
          processName: "dither-booth-web",
          service,
        });
      },
      restartTimeoutSafetyMs: 30,
    });
    const { closes, sentEvents, socket } = createTestSocket();

    route.message?.(socket, JSON.stringify({ service: "web" }));
    await flushAsyncRoute();
    completion.reject(new Error("late restart failure"));
    await flushAsyncRoute();

    expect(sentEvents).toContainEqual({
      type: "failed",
      code: "pm2-restart-failed",
      error: "Failed to restart PM2 process.",
      message: "Failed to restart PM2 process.",
      service: "web",
    });
    expect(closes).toEqual([
      {
        code: 1011,
        reason: "Failed to restart PM2 process.",
      },
    ]);
  });

  it("keeps the restart lock during the timeout safety window", async () => {
    let attempts = 0;
    const route = createPm2RestartRoute({
      restartService: async ({ service }) => {
        attempts += 1;

        if (attempts === 1) {
          throw new Pm2RestartTimeoutError({
            completion: new Promise<void>(() => undefined),
            message: "Timed out restarting dither-booth-web.",
            processName: "dither-booth-web",
            service,
          });
        }

        return {
          ok: true,
          processName: `dither-booth-${service}`,
          restartedAt: "2026-05-12T00:00:00.000Z",
          service,
        };
      },
      reconcileRestartStatus: async ({ processName }) => ({
        exists: true,
        processName,
        status: "online",
      }),
      restartTimeoutSafetyMs: 1,
    });
    const first = createTestSocket();
    const second = createTestSocket();
    const third = createTestSocket();

    route.message?.(first.socket, JSON.stringify({ service: "web" }));
    await flushAsyncRoute();
    route.message?.(second.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(second.sentEvents).toEqual([
      {
        type: "failed",
        code: "restart-in-progress",
        error: "Restart already in progress.",
        message: "Restart already in progress.",
        service: "api",
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(first.closes).toContainEqual({
      code: 1011,
      reason:
        "Timed out restarting dither-booth-web. Current PM2 status: online.",
    });
    route.message?.(third.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(third.closes).toContainEqual({
      code: 1000,
      reason: "PM2 restart completed.",
    });
  });

  it("keeps the restart lock during unknown-state guard", async () => {
    let attempts = 0;
    const route = createPm2RestartRoute({
      reconcileRestartStatus: async () => {
        throw new Error("status unavailable");
      },
      restartService: async ({ service }) => {
        attempts += 1;

        if (attempts === 1) {
          throw new Pm2RestartTimeoutError({
            completion: new Promise<void>(() => undefined),
            message: "Timed out restarting dither-booth-web.",
            processName: "dither-booth-web",
            service,
          });
        }

        return {
          ok: true,
          processName: `dither-booth-${service}`,
          restartedAt: "2026-05-12T00:00:00.000Z",
          service,
        };
      },
      restartTimeoutSafetyMs: 1,
      unknownStateGuardMs: 20,
    });
    const first = createTestSocket();
    const second = createTestSocket();
    const third = createTestSocket();

    route.message?.(first.socket, JSON.stringify({ service: "web" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    route.message?.(second.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(first.sentEvents).toContainEqual({
      type: "failed",
      code: "pm2-status-unknown",
      error: "PM2 restart status unknown. Check PM2 before retrying.",
      message: "PM2 restart status unknown. Check PM2 before retrying.",
      processName: "dither-booth-web",
      service: "web",
    });
    expect(second.sentEvents).toContainEqual({
      type: "failed",
      code: "restart-in-progress",
      error: "Restart already in progress.",
      message: "Restart already in progress.",
      service: "api",
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    route.message?.(third.socket, JSON.stringify({ service: "api" }));
    await flushAsyncRoute();

    expect(third.closes).toContainEqual({
      code: 1000,
      reason: "PM2 restart completed.",
    });
  });

  it("handles real websocket restart requests through the browser-server upgrade route", async () => {
    const result: Pm2RestartResult = {
      ok: true,
      processName: "dither-booth-web",
      restartedAt: "2026-05-12T00:00:00.000Z",
      service: "web",
    };
    const route = createPm2RestartRoute({
      restartService: async ({ onProgress }) => {
        await onProgress?.({
          type: "restarting",
          service: "web",
          processName: result.processName,
          message: "Restarting dither-booth-web.",
        });

        return result;
      },
    });
    const server = createRestartWebSocketServer(route);

    try {
      const response = await requestRestartFromRealWebSocket({
        port: server.port!,
      });

      expect(response.events.map((event) => event.type)).toEqual([
        "accepted",
        "restarting",
        "completed",
      ]);
      expect(response.closeCode).toBe(1000);
      expect(response.closeReason).toBe("PM2 restart completed.");
    } finally {
      server.stop();
    }
  });

  it("keeps full failure events but bounds real websocket close reasons", async () => {
    const longMessage = `Failed to restart ${"dither-booth-web ".repeat(20)}`;
    const route = createPm2RestartRoute({
      restartService: async () => {
        throw new Pm2RestartOperationError({
          code: "pm2-restart-failed",
          message: longMessage,
          phase: "restart",
          processName: "dither-booth-web",
          publicMessage: longMessage,
          service: "web",
        });
      },
    });
    const server = createRestartWebSocketServer(route);

    try {
      const response = await requestRestartFromRealWebSocket({
        port: server.port!,
      });
      const failedEvent = response.events.find(
        (event) => event.type === "failed",
      );

      expect(failedEvent).toMatchObject({
        type: "failed",
        code: "pm2-restart-failed",
        error: longMessage,
        message: longMessage,
        processName: "dither-booth-web",
        service: "web",
      });
      expect(response.closeCode).toBe(1011);
      expect(
        new TextEncoder().encode(response.closeReason).length,
      ).toBeLessThanOrEqual(PM2_RESTART_CLOSE_REASON_MAX_BYTES);
      expect(response.closeReason.endsWith("...")).toBe(true);
    } finally {
      server.stop();
    }
  });
});

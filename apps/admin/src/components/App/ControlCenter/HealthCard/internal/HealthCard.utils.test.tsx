import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { Pm2RestartProgressEvent } from "#lib/pm2/pm2-control.types";

import { requestPm2ServiceRestart } from "./HealthCard.utils";

type TestWebSocketEventMap = {
  close: CloseEvent;
  error: Event;
  message: MessageEvent;
  open: Event;
};

class TestWebSocket {
  static instances: TestWebSocket[] = [];

  closeCalls: Array<{ code?: number; reason?: string }> = [];
  listeners: {
    [K in keyof TestWebSocketEventMap]: Set<
      (event: TestWebSocketEventMap[K]) => void
    >;
  } = {
    close: new Set(),
    error: new Set(),
    message: new Set(),
    open: new Set(),
  };
  sentMessages: string[] = [];
  url: string;

  constructor(url: string | URL) {
    this.url = String(url);
    TestWebSocket.instances.push(this);
  }

  addEventListener<K extends keyof TestWebSocketEventMap>(
    type: K,
    listener: (event: TestWebSocketEventMap[K]) => void,
  ) {
    this.listeners[type].add(listener);
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason });
  }

  emit<K extends keyof TestWebSocketEventMap>(
    type: K,
    event: TestWebSocketEventMap[K],
  ) {
    for (const listener of this.listeners[type]) {
      listener(event);
    }
  }

  removeEventListener<K extends keyof TestWebSocketEventMap>(
    type: K,
    listener: (event: TestWebSocketEventMap[K]) => void,
  ) {
    this.listeners[type].delete(listener);
  }

  send(message: string) {
    this.sentMessages.push(message);
  }
}

function createMessageEvent(data: unknown): MessageEvent {
  return {
    data,
  } as MessageEvent;
}

function createCloseEvent(code: number, reason: string): CloseEvent {
  return {
    code,
    reason,
  } as CloseEvent;
}

const result = {
  ok: true,
  processName: "dither-booth-web",
  restartedAt: "2026-05-12T00:00:00.000Z",
  service: "web",
} as const;

const completedEvent: Pm2RestartProgressEvent = {
  type: "completed",
  result,
  service: "web",
  processName: result.processName,
  message: "dither-booth-web restarted.",
};

describe("requestPm2ServiceRestart", () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    TestWebSocket.instances = [];
    globalThis.WebSocket = TestWebSocket as unknown as typeof WebSocket;
    globalThis.window = {
      location: {
        href: "https://admin.local/control",
        protocol: "https:",
      },
    } as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    globalThis.window = originalWindow;
  });

  it("sends the restart request and resolves completed events", async () => {
    const progressEvents: Pm2RestartProgressEvent[] = [];
    const restartPromise = requestPm2ServiceRestart({
      onProgress: (event) => {
        progressEvents.push(event);
      },
      service: "web",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit("open", new Event("open"));
    socket.emit("message", createMessageEvent(JSON.stringify(completedEvent)));

    await expect(restartPromise).resolves.toEqual(result);
    expect(socket.url).toBe("wss://admin.local/admin/pm2/restart");
    expect(socket.sentMessages).toEqual([JSON.stringify({ service: "web" })]);
    expect(progressEvents).toEqual([completedEvent]);
    expect(socket.closeCalls).toEqual([
      {
        code: undefined,
        reason: undefined,
      },
    ]);
  });

  it("rejects failed restart events", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "api",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit(
      "message",
      createMessageEvent(
        JSON.stringify({
          type: "failed",
          error: "Failed to restart PM2 process.",
          message: "Failed to restart PM2 process.",
          service: "api",
        }),
      ),
    );

    await expect(restartPromise).rejects.toThrow(
      "Failed to restart PM2 process.",
    );
    expect(socket.closeCalls).toEqual([
      {
        code: undefined,
        reason: undefined,
      },
    ]);
  });

  it("rejects malformed restart events and closes the socket", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "api",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit(
      "message",
      createMessageEvent(JSON.stringify({ type: "nope" })),
    );

    await expect(restartPromise).rejects.toThrow();
    expect(socket.closeCalls).toEqual([
      {
        code: undefined,
        reason: undefined,
      },
    ]);
  });

  it("rejects WebSocket connection errors", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "api",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit("error", new Event("error"));

    await expect(restartPromise).rejects.toThrow(
      "Failed to connect to PM2 restart stream.",
    );
  });

  it("rejects unexpected closes before completion", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "api",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit("close", createCloseEvent(1011, "restart failed"));

    await expect(restartPromise).rejects.toThrow("restart failed");
  });

  it("rejects normal closes before completion", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "web",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit(
      "close",
      createCloseEvent(1000, "PM2 restart completed without result."),
    );

    await expect(restartPromise).rejects.toThrow(
      "PM2 restart completed without result.",
    );
  });

  it("ignores closes after completed events", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "web",
    });
    const socket = TestWebSocket.instances[0]!;

    socket.emit("message", createMessageEvent(JSON.stringify(completedEvent)));
    socket.emit("close", createCloseEvent(1000, "done"));

    await expect(restartPromise).resolves.toEqual(result);
  });

  it("times out if no terminal event arrives", async () => {
    const restartPromise = requestPm2ServiceRestart({
      service: "api",
      timeoutMs: 1,
    });
    const socket = TestWebSocket.instances[0]!;

    await expect(restartPromise).rejects.toThrow(
      "Timed out waiting for PM2 restart.",
    );
    expect(socket.closeCalls).toEqual([
      {
        code: undefined,
        reason: undefined,
      },
    ]);
  });
});

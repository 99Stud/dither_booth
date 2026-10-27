import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { createClientLogRoute } from "#internal/client-log.routes";

const PUBLIC_ORIGIN = "https://192.168.1.172:3001";

type LogSpy = ReturnType<typeof mock<(...args: unknown[]) => void>>;

const originalConsole = {
  error: console.error,
  info: console.info,
  warn: console.warn,
};

let logged: { error: LogSpy; info: LogSpy; warn: LogSpy };

const loggedLines = () => {
  return [
    ...logged.error.mock.calls,
    ...logged.info.mock.calls,
    ...logged.warn.mock.calls,
  ];
};

const validReport = (overrides: Record<string, unknown> = {}) => ({
  deviceId: "ipad-1",
  details: { route: "/experience" },
  error: {
    message: "Camera exploded",
    name: "Error",
    stack: "Error: Camera exploded\n    at main.tsx:12:4",
  },
  event: "window-error",
  level: "error",
  runId: 3,
  source: "web.browser",
  ...overrides,
});

const postReport = (
  body: unknown,
  {
    origin = PUBLIC_ORIGIN,
    method = "POST",
  }: { origin?: string | null; method?: string } = {},
) => {
  const headers = new Headers({ "content-type": "text/plain;charset=UTF-8" });

  if (origin) {
    headers.set("origin", origin);
  }

  return new Request(`${PUBLIC_ORIGIN}/client-log`, {
    body:
      method === "GET"
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
    headers,
    method,
  });
};

const createRoute = (now: () => number = () => 0) => {
  return createClientLogRoute({
    allowedHostnames: ["99framboises.local"],
    now,
    publicOrigin: PUBLIC_ORIGIN,
  });
};

beforeEach(() => {
  logged = {
    error: mock((..._args: unknown[]) => undefined),
    info: mock((..._args: unknown[]) => undefined),
    warn: mock((..._args: unknown[]) => undefined),
  };
  console.error = logged.error as typeof console.error;
  console.info = logged.info as typeof console.info;
  console.warn = logged.warn as typeof console.warn;
});

afterEach(() => {
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
});

describe("createClientLogRoute", () => {
  it("logs a valid report as one line marked as from the browser", async () => {
    const response = await createRoute()(postReport(validReport()));

    expect(response?.status).toBe(204);
    expect(logged.error).toHaveBeenCalledTimes(1);
    expect(loggedLines()).toHaveLength(1);

    const [line] = logged.error.mock.calls[0]! as [string];

    expect(line.startsWith("[kiosk] ")).toBe(true);
    expect(line).not.toContain("\n");
    expect(JSON.parse(line.slice("[kiosk] ".length))).toEqual({
      deviceId: "ipad-1",
      details: { route: "/experience" },
      error: {
        message: "Camera exploded",
        name: "Error",
        stack: "Error: Camera exploded\n    at main.tsx:12:4",
      },
      event: "window-error",
      level: "error",
      loggedAt: expect.any(String),
      origin: "browser",
      runId: 3,
      source: "web.browser",
    });
  });

  it("logs a warning on the warning stream", async () => {
    const response = await createRoute()(
      postReport(validReport({ error: undefined, level: "warn" })),
    );

    expect(response?.status).toBe(204);
    expect(logged.warn).toHaveBeenCalledTimes(1);
    expect(loggedLines()).toHaveLength(1);
  });

  it("accepts a manifest hostname on the same port", async () => {
    const response = await createRoute()(
      postReport(validReport(), { origin: "https://99framboises.local:3001" }),
    );

    expect(response?.status).toBe(204);
    expect(loggedLines()).toHaveLength(1);
  });

  it("refuses a foreign or missing origin and logs nothing", async () => {
    const route = createRoute();

    for (const origin of ["https://evil.example:3001", null]) {
      const response = await route(postReport(validReport(), { origin }));

      expect(response?.status).toBe(403);
    }

    expect(loggedLines()).toHaveLength(0);
  });

  it("refuses a body over 16 KB and logs nothing", async () => {
    const response = await createRoute()(
      postReport(validReport({ details: { blob: "x".repeat(16 * 1024) } })),
    );

    expect(response?.status).toBe(413);
    expect(loggedLines()).toHaveLength(0);
  });

  it("refuses an oversized body that has no length header", async () => {
    const body = JSON.stringify(
      validReport({ details: { blob: "x".repeat(16 * 1024) } }),
    );
    const request = new Request(`${PUBLIC_ORIGIN}/client-log`, {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      headers: { origin: PUBLIC_ORIGIN },
      method: "POST",
    });

    expect(request.headers.get("content-length")).toBeNull();

    const response = await createRoute()(request);

    expect(response?.status).toBe(413);
    expect(loggedLines()).toHaveLength(0);
  });

  it("refuses an invalid body and logs nothing", async () => {
    const route = createRoute();

    for (const body of [
      "not json",
      validReport({ level: "info" }),
      validReport({ deviceId: "" }),
      validReport({ event: undefined }),
      validReport({ error: { stack: "no message" } }),
    ]) {
      const response = await route(postReport(body));

      expect(response?.status).toBe(400);
    }

    expect(loggedLines()).toHaveLength(0);
  });

  it("only takes POST", async () => {
    const response = await createRoute()(
      postReport(undefined, { method: "GET" }),
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("POST");
    expect(loggedLines()).toHaveLength(0);
  });

  it("refuses a device's 31st report in a minute and logs nothing for it", async () => {
    let time = 0;
    const route = createRoute(() => time);

    for (let index = 0; index < 30; index += 1) {
      const response = await route(postReport(validReport()));

      expect(response?.status).toBe(204);
    }

    const refused = await route(postReport(validReport()));

    expect(refused?.status).toBe(429);
    expect(loggedLines()).toHaveLength(30);

    const otherDevice = await route(
      postReport(validReport({ deviceId: "phone-2" })),
    );

    expect(otherDevice?.status).toBe(204);
    expect(loggedLines()).toHaveLength(31);

    time = 60_000;

    const nextMinute = await route(postReport(validReport()));

    expect(nextMinute?.status).toBe(204);
    expect(loggedLines()).toHaveLength(32);
  });

  it("counts warnings and errors apart, so a warning loop can't refuse errors", async () => {
    const route = createRoute();

    for (let index = 0; index < 30; index += 1) {
      await route(postReport(validReport({ level: "warn" })));
    }

    const extraWarning = await route(
      postReport(validReport({ level: "warn" })),
    );
    expect(extraWarning?.status).toBe(429);

    for (let index = 0; index < 30; index += 1) {
      const response = await route(postReport(validReport()));

      expect(response?.status).toBe(204);
    }

    const extraError = await route(postReport(validReport()));
    expect(extraError?.status).toBe(429);
    expect(loggedLines()).toHaveLength(60);
  });
});

import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const LOGGER_ENTRY = fileURLToPath(new URL("./src/index.ts", import.meta.url));
const KIOSK_PREFIX = "[kiosk] ";

/**
 * Runs `body` in a fresh Bun process with `logKioskEvent` in scope and
 * returns exactly what it wrote to stdout and stderr.
 */
const runLogger = async (
  body: string,
  env: { NODE_ENV: string } = { NODE_ENV: "production" },
) => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import { logKioskEvent } from ${JSON.stringify(LOGGER_ENTRY)};\n${body}`,
    ],
    { env: { ...process.env, ...env }, stderr: "pipe", stdout: "pipe" },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, stderr, stdout };
};

const getLines = (output: string) => {
  return output.split("\n").filter((line) => line.length > 0);
};

const parseEventLine = (line: string) => {
  expect(line.startsWith(KIOSK_PREFIX)).toBe(true);

  return JSON.parse(line.slice(KIOSK_PREFIX.length)) as Record<string, unknown>;
};

describe("logKioskEvent output", () => {
  it("writes an info event as one JSON line on stdout", async () => {
    const { stderr, stdout } = await runLogger(`
      logKioskEvent("info", "engine.printer", "printer-connected", {
        details: { model: "TM-T20III", conditions: ["online", "paper-ok"] },
      });
    `);

    const lines = getLines(stdout);

    expect(stderr).toBe("");
    expect(lines).toHaveLength(1);
    expect(parseEventLine(lines[0]!)).toEqual({
      details: { conditions: ["online", "paper-ok"], model: "TM-T20III" },
      event: "printer-connected",
      level: "info",
      loggedAt: expect.any(String),
      source: "engine.printer",
    });
  });

  it("writes error and warn events as one line each on stderr, stack included", async () => {
    const { stderr, stdout } = await runLogger(`
      logKioskEvent("warn", "engine.kiosk", "kiosk-page-disconnected");
      logKioskEvent("error", "engine.printer", "lottery-ticket-print-failed", {
        error: {
          message: "Printer offline",
          name: "PrinterError",
          stack: "PrinterError: Printer offline\\n    at print (printer.ts:1:1)\\n    at run (run.ts:2:2)",
        },
      });
    `);

    const lines = getLines(stderr);

    expect(stdout).toBe("");
    expect(lines).toHaveLength(2);
    expect(parseEventLine(lines[0]!)).toMatchObject({
      event: "kiosk-page-disconnected",
      level: "warn",
    });
    expect(parseEventLine(lines[1]!)).toMatchObject({
      error: {
        message: "Printer offline",
        name: "PrinterError",
        stack:
          "PrinterError: Printer offline\n    at print (printer.ts:1:1)\n    at run (run.ts:2:2)",
      },
      event: "lottery-ticket-print-failed",
      level: "error",
    });
  });

  it("writes big integers, byte arrays and circular details without throwing", async () => {
    const { exitCode, stdout } = await runLogger(`
      const job = { id: "job-1" };
      job.self = job;
      job.steps = [job];

      logKioskEvent("info", "engine.printer", "printer-status-changed", {
        details: {
          bytesWritten: 9007199254740993n,
          job,
          raw: new Uint8Array([16, 4, 1]),
        },
      });
    `);

    const lines = getLines(stdout);

    expect(exitCode).toBe(0);
    expect(lines).toHaveLength(1);
    expect(parseEventLine(lines[0]!).details).toEqual({
      bytesWritten: "9007199254740993",
      job: { id: "job-1", self: "[circular]", steps: ["[circular]"] },
      raw: [16, 4, 1],
    });
  });

  it("still writes the event when a detail can't be serialised", async () => {
    const { exitCode, stdout } = await runLogger(`
      logKioskEvent("info", "engine.kiosk", "kiosk-reload-sent", {
        details: {
          page: { toJSON: () => { throw new Error("detached"); } },
        },
      });
      logKioskEvent("info", "engine.kiosk", "after");
    `);

    const lines = getLines(stdout);

    expect(exitCode).toBe(0);
    expect(lines).toHaveLength(2);
    expect(parseEventLine(lines[0]!)).toMatchObject({
      details: "[unserializable: detached]",
      event: "kiosk-reload-sent",
      level: "info",
      source: "engine.kiosk",
    });
    expect(parseEventLine(lines[1]!)).toMatchObject({ event: "after" });
  });

  it("redacts the values of secret-looking detail keys, at any depth", async () => {
    const { stderr } = await runLogger(`
      logKioskEvent("error", "engine.device-setup", "wifi-join-failed", {
        details: {
          ssid: "BoothNet",
          wifiPassword: "hunter22",
          PSK: "abcdef12",
          network: { Passphrase: "open sesame", security: "wpa2" },
          darkroom_pin: 4321,
          sessions: [{ accessToken: { value: "tok-1" }, device: "kiosk-a" }],
          "hub-secret": "s3cr3t",
          spinning: true,
          passive: false,
        },
      });
    `);

    const lines = getLines(stderr);

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("hunter22");
    expect(lines[0]).not.toContain("tok-1");
    expect(parseEventLine(lines[0]!).details).toEqual({
      darkroom_pin: "[redacted]",
      "hub-secret": "[redacted]",
      network: { Passphrase: "[redacted]", security: "wpa2" },
      passive: false,
      PSK: "[redacted]",
      sessions: [{ accessToken: "[redacted]", device: "kiosk-a" }],
      spinning: true,
      ssid: "BoothNet",
      wifiPassword: "[redacted]",
    });
  });
});

describe("logKioskEvent output in development", () => {
  const DEVELOPMENT = { NODE_ENV: "development" };

  it("writes a readable entry instead of the kiosk line", async () => {
    const { stderr, stdout } = await runLogger(
      `
      logKioskEvent("error", "engine.server", "trpc-request-failed", {
        details: { code: "FORBIDDEN", path: "ops.getHealthz" },
        error: {
          cause: "boom",
          message: "Request origin not allowed.",
          name: "TRPCError",
          stack: "TRPCError: Request origin not allowed.\\n    at forbidden (trpc.ts:42:7)",
        },
      });
    `,
      DEVELOPMENT,
    );

    expect(stdout).toBe("");
    expect(stderr).not.toContain(KIOSK_PREFIX);
    expect(getLines(stderr)).toEqual([
      expect.stringMatching(
        /^\d{2}:\d{2}:\d{2}\.\d{3} ERROR engine\.server trpc-request-failed$/,
      ),
      "  details: {",
      '    "code": "FORBIDDEN",',
      '    "path": "ops.getHealthz"',
      "  }",
      "  error: TRPCError: Request origin not allowed.",
      "      at forbidden (trpc.ts:42:7)",
      "  cause: boom",
    ]);
  });

  it("keeps an event without details or error to its header line", async () => {
    const { stdout } = await runLogger(
      `logKioskEvent("info", "engine.kiosk", "kiosk-reload-sent");`,
      DEVELOPMENT,
    );

    expect(getLines(stdout)).toEqual([
      expect.stringMatching(
        /^\d{2}:\d{2}:\d{2}\.\d{3} INFO  engine\.kiosk kiosk-reload-sent$/,
      ),
    ]);
  });

  it("redacts secrets and survives details that cannot be written", async () => {
    const { stderr, stdout } = await runLogger(
      `
      logKioskEvent("warn", "engine.device-setup", "wifi-join-failed", {
        details: { ssid: "BoothNet", wifiPassword: "hunter22" },
      });
      logKioskEvent("info", "engine.kiosk", "kiosk-reload-sent", {
        details: { page: { toJSON: () => { throw new Error("detached"); } } },
      });
    `,
      DEVELOPMENT,
    );

    expect(stderr).not.toContain("hunter22");
    expect(stderr).toContain('    "wifiPassword": "[redacted]"');
    expect(stdout).toContain("  details: [unserializable: detached]");
  });
});

describe("parseKioskLogLine", () => {
  it("reads back exactly what the logger writes, browser fields included", async () => {
    const { stderr } = await runLogger(`
      logKioskEvent("error", "web.browser", "window-error", {
        browser: { deviceId: "a1b2c3", runId: 4 },
        details: { route: "/" },
        error: { name: "TypeError", message: "boom", stack: "TypeError: boom" },
      });
    `);
    const { parseKioskLogLine } = await import("./src/isomorphic/kiosk-line");

    expect(parseKioskLogLine(getLines(stderr)[0]!)).toEqual({
      deviceId: "a1b2c3",
      details: { route: "/" },
      error: { message: "boom", name: "TypeError", stack: "TypeError: boom" },
      event: "window-error",
      level: "error",
      loggedAt: expect.any(String),
      origin: "browser",
      runId: 4,
      source: "web.browser",
    });
  });

  it("returns nothing for a line that isn't a kiosk event", async () => {
    const { parseKioskLogLine } = await import("./src/isomorphic/kiosk-line");

    expect(parseKioskLogLine("error: uncaught exception")).toBeUndefined();
    expect(parseKioskLogLine("[kiosk] {not json")).toBeUndefined();
    expect(parseKioskLogLine('[kiosk] {"level":"loud"}')).toBeUndefined();
  });
});

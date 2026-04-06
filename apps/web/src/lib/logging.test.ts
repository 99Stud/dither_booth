import { afterEach, describe, expect, it, mock } from "bun:test";
import { toast } from "sonner";

import {
  getKioskErrorDiagnostics,
  logKioskEvent,
  reportKioskError,
} from "./logging.ts";

const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
const originalToastError = toast.error;

afterEach(() => {
  console.error = originalConsoleError;
  console.info = originalConsoleInfo;
  toast.error = originalToastError;
});

describe("getKioskErrorDiagnostics", () => {
  it("preserves structured error fields when given an Error", () => {
    const cause = new Error("Camera permission denied");
    const error = new Error("Camera access failed", { cause });

    error.name = "CameraError";

    expect(getKioskErrorDiagnostics(error, "Camera failed.")).toMatchObject({
      cause: "Camera permission denied",
      message: "Camera access failed",
      name: "CameraError",
      stack: expect.any(String),
    });
  });

  it("falls back to a safe message for non-Error inputs", () => {
    expect(getKioskErrorDiagnostics({ reason: "unknown" }, "Camera failed.")).toEqual(
      {
        message: "Camera failed.",
      },
    );
  });
});

describe("logKioskEvent", () => {
  it("keeps reserved fields at the top level and nests caller payload", () => {
    const infoSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );

    console.info = infoSpy as typeof console.info;

    logKioskEvent("info", "camera", "camera-state-changed", {
      details: {
        event: "nested-event",
        level: "nested-level",
        source: "nested-source",
        status: "ready",
      },
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);

    const [prefix, payload] = infoSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      event: "camera-state-changed",
      level: "info",
      loggedAt: expect.any(String),
      source: "camera",
    });
    expect(payload).not.toHaveProperty("status");
    expect(payload).toMatchObject({
      details: {
        event: "nested-event",
        level: "nested-level",
        source: "nested-source",
        status: "ready",
      },
    });
  });
});

describe("reportKioskError", () => {
  it("shows a safe user message while logging richer diagnostics", () => {
    const errorSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const toastSpy = mock<
      (...args: Parameters<typeof toast.error>) => ReturnType<typeof toast.error>
    >((..._args) => "toast-id" as ReturnType<typeof toast.error>);

    console.error = errorSpy as typeof console.error;
    toast.error = toastSpy as unknown as typeof toast.error;

    reportKioskError(new Error("SQLITE_BUSY: database is locked"), {
      details: {
        action: "generate-receipt",
      },
      event: "generate-receipt-failed",
      source: "root",
      userMessage: "Generate receipt failed.",
    });

    expect(toastSpy).toHaveBeenCalledWith("Generate receipt failed.");
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [prefix, payload] = errorSpy.mock.calls[0]!;

    expect(prefix).toBe("[kiosk]");
    expect(payload).toMatchObject({
      details: {
        action: "generate-receipt",
      },
      error: {
        message: "SQLITE_BUSY: database is locked",
        name: "Error",
        stack: expect.any(String),
      },
      event: "generate-receipt-failed",
      level: "error",
      source: "root",
    });
  });
});

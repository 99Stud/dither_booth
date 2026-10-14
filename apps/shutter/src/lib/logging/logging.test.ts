import { afterEach, describe, expect, it, mock } from "bun:test";
import { toast } from "sonner";

import { reportKioskError } from "./logging.utils";

const originalConsoleError = console.error;
const originalToastError = toast.error;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

const restoreWindow = () => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }

  delete (globalThis as { window?: unknown }).window;
};

afterEach(() => {
  console.error = originalConsoleError;
  toast.error = originalToastError;
  restoreWindow();
});

describe("reportKioskError", () => {
  it("shows a safe user message while logging richer diagnostics", () => {
    const errorSpy = mock<(...args: [string, unknown]) => void>(
      (..._args) => undefined,
    );
    const toastSpy = mock<
      (
        ...args: Parameters<typeof toast.error>
      ) => ReturnType<typeof toast.error>
    >((..._args) => "toast-id" as ReturnType<typeof toast.error>);

    console.error = errorSpy as typeof console.error;
    toast.error = toastSpy as unknown as typeof toast.error;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: undefined,
    });

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

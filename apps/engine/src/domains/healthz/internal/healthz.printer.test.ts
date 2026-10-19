import { describe, expect, test } from "bun:test";

import type { PrinterStatus } from "#domains/printer/printer.service";

import { checkPrinterHealthz } from "./healthz.printer";

const status = (overrides: Partial<PrinterStatus>): PrinterStatus => ({
  canPrint: true,
  changedAt: "2026-10-19T14:02:00.000Z",
  checkedAt: "2026-10-19T14:02:00.000Z",
  conditions: [],
  history: [],
  lastError: null,
  offline: false,
  raw: "1400000f",
  ...overrides,
});

describe("checkPrinterHealthz", () => {
  test("is healthy while the printer can print", () => {
    expect(checkPrinterHealthz(status({}), { dryRun: false })).toMatchObject({
      ok: true,
      details: { canPrint: true, warning: null },
    });
  });

  test("paper low stays healthy, with a warning", () => {
    expect(
      checkPrinterHealthz(status({ conditions: ["paper-near-end"] }), {
        dryRun: false,
      }),
    ).toMatchObject({
      ok: true,
      details: { warning: "Paper is running low." },
    });
  });

  test("names the fault that stops printing", () => {
    expect(
      checkPrinterHealthz(
        status({ canPrint: false, conditions: ["paper-out", "cover-open"] }),
        { dryRun: false },
      ),
    ).toMatchObject({ ok: false, message: "Printer is out of paper." });
  });

  test("keeps why the connection failed", () => {
    expect(
      checkPrinterHealthz(
        status({
          canPrint: false,
          conditions: ["disconnected"],
          lastError: "LIBUSB_ERROR_ACCESS",
        }),
        { dryRun: false },
      ),
    ).toMatchObject({
      ok: false,
      message: "Printer is not connected.",
      error: { cause: "LIBUSB_ERROR_ACCESS" },
    });
  });

  test("says the watch is off in dry run", () => {
    expect(
      checkPrinterHealthz(status({ conditions: ["unknown"] }), {
        dryRun: true,
      }),
    ).toMatchObject({
      ok: false,
      message: "Printer watch off (RECEIPT_PRINT_DRY_RUN).",
      details: { watched: false },
    });
  });
});

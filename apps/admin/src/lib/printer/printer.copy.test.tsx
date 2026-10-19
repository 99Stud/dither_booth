import type {
  PrinterCondition,
  PrinterStatus,
} from "@dither-booth/shared/printer";

import { describe, expect, it } from "bun:test";

import {
  getPrinterAction,
  getPrinterBadge,
  getPrinterHistoryLabel,
  getPrinterMaintenanceLine,
  getPrinterStatusLine,
  getPrinterTrouble,
} from "./printer.copy";

// 14:02 in the test's local time, so `HH:mm` reads the same everywhere.
const AT = new Date(2026, 9, 19, 14, 2, 11).toISOString();

const status = (
  conditions: PrinterCondition[],
  canPrint = conditions.every((condition) => condition === "paper-near-end"),
): PrinterStatus => ({
  canPrint,
  changedAt: AT,
  checkedAt: AT,
  conditions,
  history: [],
  lastError: null,
  offline: !canPrint,
  raw: null,
});

describe("getPrinterBadge", () => {
  it.each([
    [[], "Ready", "success"],
    [["paper-near-end"], "Paper low", "warning"],
    [["paper-out"], "Out of paper", "destructive"],
    [["paper-out", "cover-open"], "Out of paper", "destructive"],
    [["cover-open"], "Cover open", "destructive"],
    [["error"], "Printer error", "destructive"],
    [["disconnected"], "Not connected", "destructive"],
    [["unknown"], "Checking…", "muted"],
  ] as const)("%p → %s", (conditions, label, tone) => {
    expect(getPrinterBadge(status([...conditions]))).toEqual({ label, tone });
  });

  it("shows Checking… while the stream reconnects", () => {
    expect(getPrinterBadge(undefined)).toEqual({
      label: "Checking…",
      tone: "muted",
    });
  });
});

describe("getPrinterStatusLine", () => {
  it.each([
    [[], "Ready to print."],
    [["paper-near-end"], "Paper is running low."],
    [["paper-out"], "Out of paper since 14:02."],
    [
      ["paper-out", "cover-open"],
      "Out of paper and the cover is open since 14:02.",
    ],
    [["cover-open"], "Cover open since 14:02."],
    [["cover-open", "paper-near-end"], "Cover open since 14:02."],
    [["error"], "The printer reported an error at 14:02."],
    [["disconnected"], "Not connected since 14:02."],
    [["unknown"], "Checking the printer…"],
  ] as const)("%p", (conditions, line) => {
    expect(getPrinterStatusLine(status([...conditions]))).toBe(line);
  });
});

describe("getPrinterAction", () => {
  it.each([
    [[], null],
    [
      ["paper-near-end"],
      "Have a new 80 mm roll ready and swap it between guests.",
    ],
    [["paper-out"], "Load a new 80 mm roll and close the cover."],
    [["paper-out", "cover-open"], "Load a new 80 mm roll and close the cover."],
    [["cover-open"], "Close the printer cover."],
    [
      ["error"],
      "Turn the printer off and on. If it keeps happening, check the cutter for a paper jam.",
    ],
    [
      ["disconnected"],
      "Check that the printer is on and its USB cable is plugged into the Pi.",
    ],
    [["unknown"], null],
  ] as const)("%p", (conditions, action) => {
    expect(getPrinterAction(status([...conditions]))).toBe(action);
  });
});

describe("getPrinterTrouble", () => {
  it.each([
    [["paper-out"], "the printer is out of paper"],
    [["cover-open"], "the printer cover is open"],
    [["error"], "the printer reported an error"],
    [["disconnected"], "the printer is not connected"],
    [["unknown"], "the printer isn't answering yet"],
  ] as const)("%p", (conditions, trouble) => {
    expect(getPrinterTrouble(status([...conditions]))).toBe(trouble);
  });
});

describe("getPrinterMaintenanceLine", () => {
  it("says the booth waits for the printer", () => {
    expect(
      getPrinterMaintenanceLine({
        automatic: true,
        reasons: ["printer"],
        status: status(["paper-out"]),
      }),
    ).toBe(
      "Booth in maintenance until the printer is ready. Guests see “be right back”.",
    );
  });

  it("warns when automatic maintenance is off and nothing prints", () => {
    expect(
      getPrinterMaintenanceLine({
        automatic: false,
        reasons: [],
        status: status(["cover-open"]),
      }),
    ).toBe(
      "Automatic maintenance is off: guests can still start a visit, but their receipt won't print.",
    );
  });

  it("says nothing while the printer prints", () => {
    expect(
      getPrinterMaintenanceLine({
        automatic: true,
        reasons: [],
        status: status([]),
      }),
    ).toBeNull();
  });

  it("doesn't warn before the printer has said anything", () => {
    expect(
      getPrinterMaintenanceLine({
        automatic: false,
        reasons: [],
        status: status(["unknown"]),
      }),
    ).toBeNull();
  });
});

describe("getPrinterHistoryLabel", () => {
  it("names the change by its most urgent condition", () => {
    expect(getPrinterHistoryLabel(["paper-out", "cover-open"])).toBe(
      "Out of paper",
    );
    expect(getPrinterHistoryLabel([])).toBe("Ready");
  });
});

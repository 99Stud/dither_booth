import type { PrinterCondition } from "@dither-booth/shared/printer";

import { getKioskCameraHealth } from "@dither-booth/shared/kiosk";

import { getPrinterStatusLine } from "#lib/printer/printer.copy";

import type { HealthzResponse } from "./healthz.types";

type KioskPage = HealthzResponse["shutter"]["kiosk"]["pages"][number];

/** What the booth's problems need from the health checks. */
export type BoothHealthInput = {
  shutter: {
    healthz: { ok: boolean };
    kiosk: { pages: readonly KioskPage[] };
  };
  engine: { healthz: { ok: boolean } };
  puppeteer: { healthz: { ok: boolean } };
  printer: {
    healthz: {
      ok: boolean;
      details?: {
        watched: boolean;
        changedAt: string;
        conditions: PrinterCondition[];
      };
    };
  };
};

/**
 * What's wrong with the booth right now, one sentence each, for staff who
 * aren't on Control center. Empty when all is well. Paper running low
 * counts; an unwatched printer (dry run) doesn't.
 */
export const getBoothProblems = (healthz: BoothHealthInput): string[] => {
  const problems: string[] = [];

  if (!healthz.shutter.healthz.ok) {
    problems.push("The booth screen isn't answering.");
  }
  if (getKioskCameraHealth(healthz.shutter.kiosk.pages) === false) {
    problems.push("The booth camera isn't working.");
  }

  const printer = healthz.printer.healthz;
  if (printer.details?.watched && printer.details.conditions.length > 0) {
    problems.push(getPrinterStatusLine(printer.details));
  } else if (!printer.ok && printer.details?.watched !== false) {
    problems.push("The printer can't print.");
  }

  if (!healthz.engine.healthz.ok || !healthz.puppeteer.healthz.ok) {
    problems.push("Tickets can't be prepared right now.");
  }

  return problems;
};

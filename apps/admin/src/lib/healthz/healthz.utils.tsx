import type { PrinterCondition } from "@dither-booth/shared/printer";

import { getPrinterStatusLine } from "#lib/printer/printer.copy";

import type { HealthzResponse } from "./healthz.types";

type KioskPage = HealthzResponse["shutter"]["kiosk"]["pages"][number];

/**
 * The booth camera's health, from what the kiosk pages report: unhealthy
 * as soon as one page's camera failed, healthy once every camera that runs
 * is ready, and unknown (undefined) while none runs or one is starting.
 */
export const getKioskCameraHealth = (
  pages: readonly KioskPage[],
): boolean | undefined => {
  const cameras = pages.flatMap((page) => (page.camera ? [page.camera] : []));

  if (
    cameras.some(
      (camera) => camera.status === "error" || camera.status === "unsupported",
    )
  ) {
    return false;
  }

  if (
    cameras.length > 0 &&
    cameras.every((camera) => camera.status === "ready")
  ) {
    return true;
  }

  return undefined;
};

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

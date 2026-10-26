import { logKioskEvent } from "@dither-booth/logging";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { ENGINE_APP_ROOT } from "#lib/constants";
import { ENGINE_PRINTER_LOG_SOURCE } from "#lib/printer/printer.constants";

import type { BoothPrinter } from "./booth-printer";
import type { PrinterStatus } from "./printer.types";

import { gsV0RasterCommandToPngBuffer } from "./gs-v0-raster.utils";

export const DEFAULT_PREVIEW_DIR = join(
  ENGINE_APP_ROOT,
  "tmp",
  "receipt-previews",
);

/** Opens the saved previews in the desktop's image viewer. */
export async function openPreviewPaths(paths: string[]): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "linux"
        ? "xdg-open"
        : undefined;
  if (!command) return;

  for (const path of paths) {
    const exitCode = await Bun.spawn([command, path], {
      stdout: "ignore",
      stderr: "ignore",
    }).exited;

    if (exitCode !== 0) {
      throw new Error(`Failed to open preview ${path} (exit ${exitCode}).`);
    }
  }
}

type PreviewLog = (event: string, details: Record<string, unknown>) => void;

const defaultLog: PreviewLog = (event, details) =>
  logKioskEvent("info", ENGINE_PRINTER_LOG_SOURCE, event, { details });

/**
 * The printer in dry run (`RECEIPT_PRINT_DRY_RUN`): always ready, and never
 * opens USB. Each raster job is saved as a PNG in `previewDir` and opened, the
 * bytes the printer would get, so a ticket printed bottom first opens turned
 * 180°. A text ticket (setup, Wi-Fi) is only logged.
 */
export function createPreviewPrinter({
  log = defaultLog,
  now = Date.now,
  openPaths = openPreviewPaths,
  previewDir = DEFAULT_PREVIEW_DIR,
}: {
  log?: PreviewLog;
  now?: () => number;
  openPaths?: (paths: string[]) => Promise<void>;
  previewDir?: string;
} = {}): BoothPrinter {
  const startedAt = new Date(now()).toISOString();
  const status: PrinterStatus = {
    canPrint: true,
    changedAt: startedAt,
    checkedAt: startedAt,
    conditions: [],
    history: [],
    lastError: null,
    offline: false,
    raw: null,
  };
  let jobs = 0;
  let queue: Promise<unknown> = Promise.resolve();

  async function save(body: Buffer) {
    jobs += 1;
    const stamp = new Date(now()).toISOString().replaceAll(":", "-");
    const path = join(previewDir, `ticket-${stamp}-${jobs}.png`);

    await mkdir(previewDir, { recursive: true });
    await Bun.write(path, await gsV0RasterCommandToPngBuffer(body));
    await openPaths([path]);
    log("printer-dry-run-saved", { path });
  }

  return {
    dryRun: true,
    getStatus: () => status,
    print(body, { content = "raster" } = {}) {
      const job = queue.then(async () => {
        if (content === "raster") return await save(body);
        log("printer-dry-run-text-ticket", { bytes: body.byteLength });
      });
      queue = job.catch(() => {});
      return job;
    },
    start: () => {},
    stop: async () => {},
    subscribe: () => () => {},
    async *watch(signal) {
      yield status;
      // Nothing ever changes: hold the stream open until the caller leaves.
      await new Promise<void>((resolve) => {
        if (signal?.aborted) return resolve();
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  };
}

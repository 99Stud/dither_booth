import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { screenshotToGsV0RasterCommand } from "./gs-v0-raster.utils";
import { createPreviewPrinter } from "./preview-printer";
import { buildTextTicket } from "./printer.escpos";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

async function rasterCommand() {
  const width = 8;
  const png = await sharp(Buffer.alloc(width * width * 3, 255), {
    raw: { width, height: width, channels: 3 },
  })
    .png()
    .toBuffer();

  return await screenshotToGsV0RasterCommand(png, { width });
}

const previewDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    previewDirs
      .splice(0)
      .map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

async function setup() {
  const previewDir = await mkdtemp(join(tmpdir(), "preview-printer-"));
  previewDirs.push(previewDir);
  const opened: string[] = [];
  const logged: string[] = [];
  const printer = createPreviewPrinter({
    log: (event) => logged.push(event),
    now: () => Date.UTC(2026, 9, 26, 14),
    openPaths: async (paths) => {
      opened.push(...paths);
    },
    previewDir,
  });

  return { logged, opened, previewDir, printer };
}

describe("createPreviewPrinter", () => {
  test("is a dry run, always ready to print", async () => {
    const { printer } = await setup();

    expect(printer.dryRun).toBe(true);
    expect(printer.getStatus()).toMatchObject({
      canPrint: true,
      conditions: [],
    });
  });

  test("is printing from a job's start to its end, queued ones included", async () => {
    const { printer } = await setup();
    const raster = await rasterCommand();

    expect(printer.isPrinting()).toBe(false);
    const jobs = Promise.all([printer.print(raster), printer.print(raster)]);
    expect(printer.isPrinting()).toBe(true);
    await jobs;
    expect(printer.isPrinting()).toBe(false);
  });

  test("saves each raster job as a PNG and opens it, in order", async () => {
    const { opened, previewDir, printer } = await setup();
    const raster = await rasterCommand();

    await Promise.all([printer.print(raster), printer.print(raster)]);

    const files = (await readdir(previewDir)).sort();
    expect(files).toEqual([
      "ticket-2026-10-26T14-00-00.000Z-1.png",
      "ticket-2026-10-26T14-00-00.000Z-2.png",
    ]);
    expect(opened).toEqual(files.map((file) => join(previewDir, file)));
    const bytes = await readFile(join(previewDir, files[0]!));
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  test("only logs a text ticket", async () => {
    const { logged, opened, previewDir, printer } = await setup();

    await printer.print(buildTextTicket([{ kind: "text", text: "Hello" }]), {
      content: "escpos",
    });

    expect(logged).toEqual(["printer-dry-run-text-ticket"]);
    expect(opened).toEqual([]);
    expect(await readdir(previewDir)).toEqual([]);
  });

  test("a preview that can't be opened fails the job, not the next one", async () => {
    const { previewDir } = await setup();
    let failNext = true;
    const printer = createPreviewPrinter({
      log: () => {},
      openPaths: async () => {
        if (failNext) {
          failNext = false;
          throw new Error("no viewer");
        }
      },
      previewDir,
    });
    const raster = await rasterCommand();

    await expect(printer.print(raster)).rejects.toThrow("no viewer");
    await expect(printer.print(raster)).resolves.toBeUndefined();
  });

  test("watch yields the ready status and ends when the caller leaves", async () => {
    const { printer } = await setup();
    const controller = new AbortController();
    const stream = printer.watch(controller.signal);

    expect((await stream.next()).value).toMatchObject({ canPrint: true });
    const done = stream.next();
    controller.abort();
    expect((await done).done).toBe(true);
  });
});

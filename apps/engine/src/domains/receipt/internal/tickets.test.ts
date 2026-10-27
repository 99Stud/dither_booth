import type { DrawResult } from "@dither-booth/shared/lottery";

import { DEFAULT_KIT_ID } from "@dither-booth/shared/kits";
import { DEFAULT_TICKET_ITEM_NAMES } from "@dither-booth/shared/ticket";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import sharp from "sharp";

import type { DB } from "#db/internal/db.types";
import type {
  BoothPrinter,
  PrinterStatus,
} from "#domains/printer/printer.service";
import type { TRPCContext } from "#lib/trpc/trpc.types";

import {
  campaignTable,
  drawTable,
  printConfigTable,
  visitTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import { createDarkroomAccessStub } from "#domains/darkroom/internal/darkroom.test-utils";
import { createHubReporterStub } from "#domains/hub/internal/hub.test-utils";
import {
  createKioskChannel,
  createKioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import {
  insertLotteryEvent,
  insertPrizeWithStock,
  stockOf,
} from "#domains/lottery/internal/lottery.test-utils";
import { createStubPrinter } from "#domains/printer/internal/printer.test-utils";
import {
  PrinterUnavailableError,
  screenshotToGsV0RasterCommand,
} from "#domains/printer/printer.service";
import { createVisits } from "#domains/visit/visit.service";
import { engineRouter } from "#internal/router";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

import type {
  LotteryTicketRender,
  PhotoReceiptRender,
  TicketRenderer,
} from "./ticket-renderer";

import { createTickets } from "./tickets";

const PHOTO = new Blob([new Uint8Array([1, 2, 3])]);
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const savedForce = [
  process.env.LOTTERY_FORCE_OUTCOME,
  process.env.LOTTERY_FORCE_PRIZE_ID,
] as const;

beforeAll(() => {
  delete process.env.LOTTERY_FORCE_OUTCOME;
  delete process.env.LOTTERY_FORCE_PRIZE_ID;
});

afterAll(() => {
  if (savedForce[0] !== undefined)
    process.env.LOTTERY_FORCE_OUTCOME = savedForce[0];
  if (savedForce[1] !== undefined)
    process.env.LOTTERY_FORCE_PRIZE_ID = savedForce[1];
});

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

function setupDb({
  outcome,
  printLoserTicket = false,
}: {
  outcome: "win" | "loss" | "no-lottery";
  printLoserTicket?: boolean;
}) {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);

  db.insert(printConfigTable).values({}).run();

  if (outcome === "no-lottery") return db;

  insertLotteryEvent(db, {
    id: "lottery-1",
    enabled: true,
    // A huge no-win weight makes every roll a loss; zero makes it a win.
    noWinWeight: outcome === "win" ? 0 : 1_000_000_000,
    winCooldownMinutes: 0,
    printLoserTicket,
  });
  insertPrizeWithStock(
    db,
    {
      id: "p1",
      lotteryId: "lottery-1",
      title: "a sticker",
      winInstruction: "Show this ticket at the bar",
      weight: 1,
      rarity: "rare",
    },
    3,
  );

  return db;
}

/**
 * Renders `photo:<ref>` and `lottery:<ref>`, so a test reads what printed.
 * The Darkroom's preview, which has no ref, gets a real raster.
 */
function createFakeRenderer(previewRaster: Buffer = Buffer.alloc(0)) {
  const photoRenders: PhotoReceiptRender[] = [];
  const lotteryRenders: LotteryTicketRender[] = [];
  let lotteryFailure: Error | undefined;

  const renderer: TicketRenderer = {
    async renderPhotoReceipt(render) {
      photoRenders.push(render);
      return render.ticketRef === undefined
        ? previewRaster
        : Buffer.from(`photo:${render.ticketRef}`);
    },
    async renderLotteryTicket(render) {
      lotteryRenders.push(render);
      if (lotteryFailure) throw lotteryFailure;
      return Buffer.from(`lottery:${render.ticketRef}`);
    },
  };

  return {
    renderer,
    photoRenders,
    lotteryRenders,
    failLotteryRenders(error: Error) {
      lotteryFailure = error;
    },
  };
}

/** Records every job, then fails it when a failure is queued for it. */
function createRecordingPrinter(status?: Partial<PrinterStatus>) {
  const printed: string[] = [];
  const options: unknown[] = [];
  const failures: Array<Error | undefined> = [];
  const printer = createStubPrinter({
    print: async (raster, printOptions) => {
      printed.push(raster.toString());
      options.push(printOptions);
      const failure = failures.shift();
      if (failure) throw failure;
    },
    status,
  });

  return {
    printer,
    printed,
    options,
    failNext(...next: Array<Error | undefined>) {
      failures.push(...next);
    },
  };
}

function setup({
  db = setupDb({ outcome: "win" }),
  printer = createRecordingPrinter(),
  previewRaster,
}: {
  db?: DB;
  printer?: ReturnType<typeof createRecordingPrinter>;
  previewRaster?: Buffer;
} = {}) {
  const fake = createFakeRenderer(previewRaster);
  const maintenance = createKioskMaintenance({
    db,
    kioskChannel: { broadcast: () => 0 },
  });
  const tickets = createTickets({
    db,
    maintenance,
    printer: printer.printer,
    renderer: fake.renderer,
    visits: createVisits({ db, log: () => {} }),
  });

  return { db, fake, maintenance, printer, tickets };
}

describe("prepareVisit and printVisit", () => {
  test("links the draw to the visit and counts each print", async () => {
    const printer = createRecordingPrinter();
    const { db, tickets } = setup({ printer });
    const visits = createVisits({ db, log: () => {} });
    const { visitId } = visits.start();

    const visit = await tickets.prepareVisit(PHOTO, visitId);
    printer.failNext(new Error("paper jam"));
    await expect(tickets.printVisit(visit.ticketRef)).rejects.toThrow();
    await tickets.printVisit(visit.ticketRef);

    const [draw] = db.select().from(drawTable).all();
    expect(visit.visitId).toBe(visitId);
    expect(db.select().from(visitTable).all()).toMatchObject([
      {
        id: visitId,
        drawId: draw?.id,
        capturedAt: expect.any(Date),
        printedAt: expect.any(Date),
        printAttempts: 2,
        endedAt: null,
      },
    ]);
  });

  test("a win commits the draw, then prints the photo receipt and the lottery ticket", async () => {
    const { db, printer, tickets } = setup();

    const visit = await tickets.prepareVisit(PHOTO, null);
    expect(printer.printed).toEqual([]);
    await tickets.printVisit(visit.ticketRef);

    expect(visit).toMatchObject({ draw: { outcome: "win" }, hasLottery: true });
    expect(printer.printed).toEqual([
      `photo:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
    ]);
    expect(db.select().from(drawTable).all()).toMatchObject([
      { prizeId: "p1", ticketRef: visit.ticketRef },
    ]);
  });

  test("renders both tickets upside down unless the booth turned it off", async () => {
    const turned = setup();
    await turned.tickets.prepareVisit(PHOTO, null);
    const db = setupDb({ outcome: "win" });
    db.update(printConfigTable).set({ upsideDown: false }).run();
    const upright = setup({ db });
    await upright.tickets.prepareVisit(PHOTO, null);

    for (const [fake, upsideDown] of [
      [turned.fake, true],
      [upright.fake, false],
    ] as const) {
      expect(fake.photoRenders.map((render) => render.upsideDown)).toEqual([
        upsideDown,
      ]);
      expect(fake.lotteryRenders.map((render) => render.upsideDown)).toEqual([
        upsideDown,
      ]);
    }
  });

  test("a loss prints no lottery ticket unless printLoserTicket is on", async () => {
    const quiet = setup({ db: setupDb({ outcome: "loss" }) });
    const quietVisit = await quiet.tickets.prepareVisit(PHOTO, null);
    await quiet.tickets.printVisit(quietVisit.ticketRef);

    expect(quietVisit.draw.outcome).toBe("loss");
    expect(quiet.fake.lotteryRenders).toEqual([]);
    expect(quiet.printer.printed).toEqual([`photo:${quietVisit.ticketRef}`]);

    const loud = setup({
      db: setupDb({ outcome: "loss", printLoserTicket: true }),
    });
    const loudVisit = await loud.tickets.prepareVisit(PHOTO, null);
    await loud.tickets.printVisit(loudVisit.ticketRef);

    expect(loud.printer.printed).toEqual([
      `photo:${loudVisit.ticketRef}`,
      `lottery:${loudVisit.ticketRef}`,
    ]);
  });

  test("a failed lottery-ticket render keeps the win and prints the photo receipt alone", async () => {
    const { db, fake, printer, tickets } = setup();
    fake.failLotteryRenders(new Error("navigation timeout"));

    const visit = await tickets.prepareVisit(PHOTO, null);
    await tickets.printVisit(visit.ticketRef);

    expect(visit.draw.outcome).toBe("win");
    expect(printer.printed).toEqual([`photo:${visit.ticketRef}`]);
    expect(db.select().from(drawTable).all()).toMatchObject([
      { prizeId: "p1", ticketRef: visit.ticketRef },
    ]);
  });

  test("re-renders the photo receipt when the draw lands on another ref", async () => {
    const db = setupDb({ outcome: "no-lottery" });
    db.insert(drawTable).values({ ticketRef: "500000" }).run();
    const { fake, printer, tickets } = setup({ db });

    // First ref (ours) collides with the existing draw, the retry gets 250000.
    const random = spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.25);

    try {
      const visit = await tickets.prepareVisit(PHOTO, null);
      await tickets.printVisit(visit.ticketRef);

      expect(visit.ticketRef).toBe("250000");
      expect(fake.photoRenders.map((render) => render.ticketRef)).toEqual([
        "500000",
        "250000",
      ]);
      expect(printer.printed).toEqual(["photo:250000"]);
    } finally {
      random.mockRestore();
    }
  });

  test("renders the photo receipt with the active event's kit and items", async () => {
    const db = setupDb({ outcome: "win" });
    db.update(campaignTable)
      .set({ kitId: "tartines", ticketItemNames: ["Mate", "Ginette"] })
      .run();
    const { fake, tickets } = setup({ db });

    await tickets.prepareVisit(PHOTO, null);

    expect(fake.photoRenders[0]).toMatchObject({
      kitId: "tartines",
      ticketItems: ["Mate", "Ginette"],
    });
    expect(fake.lotteryRenders[0]).toMatchObject({ kitId: "tartines" });
  });

  test("renders the default kit when no event is active", async () => {
    const { fake, tickets } = setup({ db: setupDb({ outcome: "no-lottery" }) });

    const visit = await tickets.prepareVisit(PHOTO, null);

    expect(visit).toMatchObject({
      draw: { outcome: "loss" },
      hasLottery: false,
    });
    expect(fake.photoRenders[0]).toMatchObject({
      kitId: DEFAULT_KIT_ID,
      ticketItems: [...DEFAULT_TICKET_ITEM_NAMES],
    });
  });

  test("rejects an empty photo before drawing", async () => {
    const { db, tickets } = setup();

    await expect(
      tickets.prepareVisit(new Blob([]), null),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.select().from(drawTable).all()).toEqual([]);
  });

  test("a printer that can't print refuses the visit before any draw", async () => {
    const { db, tickets } = setup({
      printer: createRecordingPrinter({
        canPrint: false,
        conditions: ["paper-out"],
      }),
    });

    await expect(tickets.prepareVisit(PHOTO, null)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Printer not ready: out of paper.",
    });
    expect(db.select().from(drawTable).all()).toEqual([]);
    expect(stockOf(db, "p1")?.remainingQuantity).toBe(3);
  });

  test("a lottery-ticket print failure is retried without a second photo receipt", async () => {
    const { printer, tickets } = setup();
    const visit = await tickets.prepareVisit(PHOTO, null);
    printer.failNext(undefined, new Error("usb hiccup"));

    await expect(tickets.printVisit(visit.ticketRef)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to print lottery ticket.",
    });
    await tickets.printVisit(visit.ticketRef);

    expect(printer.printed).toEqual([
      `photo:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
    ]);
    // Printed in full: the visit is gone.
    await expect(tickets.printVisit(visit.ticketRef)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("a photo receipt failure prints nothing else and can be retried", async () => {
    const { printer, tickets } = setup();
    const visit = await tickets.prepareVisit(PHOTO, null);
    printer.failNext(new Error("usb gone"));

    await expect(tickets.printVisit(visit.ticketRef)).rejects.toMatchObject({
      message: "Failed to print receipt.",
    });
    expect(printer.printed).toEqual([`photo:${visit.ticketRef}`]);

    await tickets.printVisit(visit.ticketRef);
    expect(printer.printed).toEqual([
      `photo:${visit.ticketRef}`,
      `photo:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
    ]);
  });

  test("a printer fault mid-print says not ready and keeps the visit to retry", async () => {
    const { printer, tickets } = setup();
    const visit = await tickets.prepareVisit(PHOTO, null);
    printer.failNext(new PrinterUnavailableError(["cover-open"]));

    await expect(tickets.printVisit(visit.ticketRef)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Printer not ready: cover open.",
    });
    await tickets.printVisit(visit.ticketRef);

    expect(printer.printed).toEqual([
      `photo:${visit.ticketRef}`,
      `photo:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
    ]);
  });

  test("with automatic maintenance off, a doubtful sensor doesn't stop the booth", async () => {
    const { maintenance, printer, tickets } = setup({
      printer: createRecordingPrinter({
        canPrint: false,
        conditions: ["cover-open"],
      }),
    });
    maintenance.setAutomatic(false);

    const visit = await tickets.prepareVisit(PHOTO, null);
    await tickets.printVisit(visit.ticketRef);

    expect(printer.printed).toHaveLength(2);
    expect(printer.options).toEqual([
      { enforceStatus: false },
      { enforceStatus: false },
    ]);
  });

  test("an unknown ticket number is not found", async () => {
    const { tickets } = setup();

    await expect(tickets.printVisit("123456")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No prepared receipt for ticket 123456.",
    });
  });
});

describe("printTestPrint", () => {
  test("prints the photo receipt under the sample ref without drawing", async () => {
    const { db, fake, printer, tickets } = setup();
    const stockBefore = stockOf(db, "p1");

    await tickets.printTestPrint(PHOTO);

    expect(printer.printed).toEqual(["photo:000000"]);
    expect(fake.lotteryRenders).toEqual([]);
    expect(db.select().from(drawTable).all()).toEqual([]);
    expect(stockOf(db, "p1")).toEqual(stockBefore);
    expect(stockBefore?.remainingQuantity).toBe(3);
  });
});

describe("printSampleLotteryTicket", () => {
  const win: DrawResult = {
    outcome: "win",
    prize: {
      id: "p1",
      title: "a sticker",
      winInstruction: "Show this ticket at the bar",
      rarity: "rare",
    },
  };

  test("prints the chosen outcome under the sample ref without touching the lottery", async () => {
    const { db, fake, printer, tickets } = setup();

    await tickets.printSampleLotteryTicket(win);

    expect(printer.printed).toEqual(["lottery:000000"]);
    expect(fake.lotteryRenders[0]).toMatchObject({
      draw: win,
      upsideDown: true,
    });
    expect(db.select().from(drawTable).all()).toEqual([]);
    expect(stockOf(db, "p1")?.remainingQuantity).toBe(3);
  });

  test("refuses when the printer can't print", async () => {
    const { tickets } = setup({
      printer: createRecordingPrinter({
        canPrint: false,
        conditions: ["paper-out"],
      }),
    });

    await expect(tickets.printSampleLotteryTicket(win)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("previewPhotoReceipt", () => {
  test("renders a PNG the right way up, without a ticket number or the printer", async () => {
    const width = 8;
    const png = await sharp(Buffer.alloc(width * width * 3, 255), {
      raw: { width, height: width, channels: 3 },
    })
      .png()
      .toBuffer();
    const { fake, printer, tickets } = setup({
      // A printer that can't print doesn't stop a preview.
      printer: createRecordingPrinter({
        canPrint: false,
        conditions: ["paper-out"],
      }),
      previewRaster: await screenshotToGsV0RasterCommand(png, { width }),
    });

    const preview = await tickets.previewPhotoReceipt(PHOTO);

    expect(preview.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(fake.photoRenders[0]).toMatchObject({ upsideDown: false });
    expect(fake.photoRenders[0]?.ticketRef).toBeUndefined();
    expect(printer.printed).toEqual([]);
  });
});

describe("the receipt procedures", () => {
  function createCaller(db: DB, printer: BoothPrinter) {
    const kioskChannel = createKioskChannel();
    const kioskMaintenance = createKioskMaintenance({ db, kioskChannel });
    const state = createInitialPuppeteerState();
    const visits = createVisits({ db, log: () => {} });
    const unreachable = () => {
      throw new Error("The receipt procedures need none of this.");
    };

    return engineRouter.createCaller({
      adminOrigin: "https://admin.local",
      allowedHostnames: [],
      db,
      darkroomAccess: createDarkroomAccessStub(),
      hubReporter: createHubReporterStub(),
      kioskChannel,
      kioskMaintenance,
      cameraPreview: {} as TRPCContext["cameraPreview"],
      mode: "production",
      network: {} as TRPCContext["network"],
      setupServerAccess: { verify: () => false },
      printer,
      processManager: "unknown",
      puppeteerLifecycle: {
        close: unreachable,
        getCurrent: unreachable,
        initialize: unreachable,
        restart: unreachable,
        whenReady: unreachable,
      },
      puppeteerState: state,
      requestOrigin: "https://admin.local",
      tickets: createTickets({
        db,
        maintenance: kioskMaintenance,
        printer,
        renderer: createFakeRenderer().renderer,
        visits,
      }),
      visits,
    } satisfies TRPCContext);
  }

  test("a booth visit starts, prepares, prints and ends through the booth group", async () => {
    const { printer, printed } = createRecordingPrinter();
    const db = setupDb({ outcome: "win" });
    const caller = createCaller(db, printer);

    const { visitId } = await caller.booth.startVisit();
    const form = new FormData();
    form.set("photo", PHOTO);
    form.set("visitId", visitId!);
    const visit = await caller.booth.prepareReceipt(form);
    await caller.booth.printPreparedReceipt({ ticketRef: visit.ticketRef });
    await caller.booth.endVisit({ visitId: visitId!, reason: "completed" });

    expect(visit.visitId).toBe(visitId);
    expect(printed).toEqual([
      `photo:${visit.ticketRef}`,
      `lottery:${visit.ticketRef}`,
    ]);
    expect(db.select().from(visitTable).all()).toMatchObject([
      { id: visitId, printAttempts: 1, endReason: "completed" },
    ]);
  });

  test("prepareReceipt without a visit id starts one at the draw", async () => {
    const caller = createCaller(
      setupDb({ outcome: "win" }),
      createRecordingPrinter().printer,
    );
    const form = new FormData();
    form.set("photo", PHOTO);

    const visit = await caller.booth.prepareReceipt(form);

    expect(visit.visitId).toEqual(expect.any(String));
  });

  test("prepareReceipt drops a visit id that can't be one and still draws", async () => {
    const db = setupDb({ outcome: "win" });
    const caller = createCaller(db, createRecordingPrinter().printer);
    const form = new FormData();
    form.set("photo", PHOTO);
    form.set("visitId", "x".repeat(65));

    const visit = await caller.booth.prepareReceipt(form);

    expect(visit.visitId).toEqual(expect.any(String));
    expect(visit.visitId).not.toBe("x".repeat(65));
    expect(db.select().from(drawTable).all()).toHaveLength(1);
  });

  test("prepareReceipt refuses a form without a photo", async () => {
    const caller = createCaller(
      setupDb({ outcome: "win" }),
      createStubPrinter(),
    );

    await expect(
      caller.booth.prepareReceipt(new FormData()),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("printPreparedReceipt rejects a malformed ticket ref", async () => {
    const caller = createCaller(
      setupDb({ outcome: "win" }),
      createStubPrinter(),
    );

    await expect(
      caller.booth.printPreparedReceipt({ ticketRef: "12345" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("config.printReceipt prints a test print", async () => {
    const { printer, printed } = createRecordingPrinter();
    const caller = createCaller(setupDb({ outcome: "win" }), printer);

    await caller.config.printReceipt(PHOTO.stream() as unknown as Blob);

    expect(printed).toEqual(["photo:000000"]);
  });

  test("drawLottery is no longer exposed", () => {
    expect(
      Object.keys(engineRouter._def.procedures).some((path) =>
        path.endsWith(".drawLottery"),
      ),
    ).toBe(false);
  });
});

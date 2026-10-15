import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

import type { DB } from "#db/internal/db.types";
import type { TRPCContext } from "#lib/trpc/trpc.types";

import {
  drawTable,
  lotteryTable,
  printConfigTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import {
  insertPrizeWithStock,
  stockOf,
} from "#domains/lottery/internal/lottery.test-utils";
import { createInitialPuppeteerState } from "#lib/puppeteer/puppeteer.utils";

// The printer and the Puppeteer renders are the only I/O in the flow; every
// DB write below is real.
const printRasterReceipt = mock(async (_adapter: USB, _cmd: Buffer) => {});
const buildReceiptRasterCommand = mock(
  async ({ ticketRef }: { ticketRef: string }) =>
    Buffer.from(`photo:${ticketRef}`),
);
const buildLotteryTicketRasterCommand = mock(
  async ({ ticketRef }: { ticketRef: string }) =>
    Buffer.from(`lottery:${ticketRef}`),
);

mock.module("#domains/printer/printer.service", () => ({
  printRasterReceipt,
}));
mock.module("./receipt-raster.utils", () => ({
  buildLotteryTicketRasterCommand,
  buildReceiptRasterCommand,
  prepareReceiptRasterCommand: mock(async () => Buffer.alloc(0)),
}));

const { prepareReceiptJob, printPreparedReceiptJob } =
  await import("./receipt-print.service");
const { preparedReceiptStore } = await import("./prepared-receipt.store");
const { engineRouter } = await import("#internal/router");

const PHOTO = new Blob([new Uint8Array([1, 2, 3])]);
const USB_ADAPTER = {} as USB;

const savedDryRun = process.env.RECEIPT_PRINT_DRY_RUN;
const savedForce = [
  process.env.LOTTERY_FORCE_OUTCOME,
  process.env.LOTTERY_FORCE_PRIZE_ID,
] as const;

beforeAll(() => {
  delete process.env.RECEIPT_PRINT_DRY_RUN;
  delete process.env.LOTTERY_FORCE_OUTCOME;
  delete process.env.LOTTERY_FORCE_PRIZE_ID;
});

afterAll(() => {
  if (savedDryRun !== undefined)
    process.env.RECEIPT_PRINT_DRY_RUN = savedDryRun;
  if (savedForce[0] !== undefined)
    process.env.LOTTERY_FORCE_OUTCOME = savedForce[0];
  if (savedForce[1] !== undefined)
    process.env.LOTTERY_FORCE_PRIZE_ID = savedForce[1];
});

const openDbs: Array<{ close: () => void }> = [];

beforeEach(() => {
  printRasterReceipt.mockReset();
  printRasterReceipt.mockImplementation(async () => {});
  buildReceiptRasterCommand.mockClear();
  buildLotteryTicketRasterCommand.mockReset();
  buildLotteryTicketRasterCommand.mockImplementation(async ({ ticketRef }) =>
    Buffer.from(`lottery:${ticketRef}`),
  );
});

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

  db.insert(lotteryTable)
    .values({
      id: "lottery-1",
      enabled: true,
      // A huge no-win weight makes every roll a loss; zero makes it a win.
      noWinWeight: outcome === "win" ? 0 : 1_000_000_000,
      winCooldownMinutes: 0,
      printLoserTicket,
    })
    .run();
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

function createCtx(db: DB) {
  const state = createInitialPuppeteerState();
  const page = {} as Page;

  return {
    adminOrigin: "https://admin.local",
    allowedHostnames: [],
    db,
    mode: "production",
    printerUSBAdapter: USB_ADAPTER,
    processManager: "unknown",
    puppeteerLifecycle: {
      close: async () => {},
      getCurrent: () => ({ state, page }),
      initialize: async () => ({ state, page }),
      restart: async () => ({ ok: true, state }),
      whenReady: async () => ({ state, page }),
    },
    puppeteerState: state,
  } satisfies TRPCContext;
}

const printedBuffers = () =>
  printRasterReceipt.mock.calls.map(([, cmd]) => cmd.toString());

describe("prepareReceiptJob", () => {
  test("a win commits the draw and renders both rasters", async () => {
    const db = setupDb({ outcome: "win" });

    const job = await prepareReceiptJob({ ctx: createCtx(db), input: PHOTO });

    expect(job.draw.outcome).toBe("win");
    expect(job.photoPrinted).toBe(false);
    expect(job.receiptRasterCmd.toString()).toBe(`photo:${job.ticketRef}`);
    expect(job.lotteryRasterCmd?.toString()).toBe(`lottery:${job.ticketRef}`);
    expect(db.select().from(drawTable).all()).toMatchObject([
      { prizeId: "p1", ticketRef: job.ticketRef },
    ]);
  });

  test("a loss skips the lottery ticket unless printLoserTicket is on", async () => {
    const quiet = await prepareReceiptJob({
      ctx: createCtx(setupDb({ outcome: "loss" })),
      input: PHOTO,
    });
    expect(quiet.draw.outcome).toBe("loss");
    expect(quiet.lotteryRasterCmd).toBeNull();
    expect(buildLotteryTicketRasterCommand).not.toHaveBeenCalled();

    const loud = await prepareReceiptJob({
      ctx: createCtx(setupDb({ outcome: "loss", printLoserTicket: true })),
      input: PHOTO,
    });
    expect(loud.draw.outcome).toBe("loss");
    expect(loud.lotteryRasterCmd?.toString()).toBe(`lottery:${loud.ticketRef}`);
  });

  test("a failed lottery-ticket render keeps the win and the photo receipt", async () => {
    const db = setupDb({ outcome: "win" });
    buildLotteryTicketRasterCommand.mockImplementation(async () => {
      throw new Error("navigation timeout");
    });

    const job = await prepareReceiptJob({ ctx: createCtx(db), input: PHOTO });

    expect(job.draw.outcome).toBe("win");
    expect(job.lotteryRasterCmd).toBeNull();
    expect(job.receiptRasterCmd.toString()).toBe(`photo:${job.ticketRef}`);
    expect(db.select().from(drawTable).all()).toMatchObject([
      { prizeId: "p1", ticketRef: job.ticketRef },
    ]);
  });

  test("re-renders the photo receipt when the draw lands on another ref", async () => {
    const db = setupDb({ outcome: "no-lottery" });
    db.insert(drawTable).values({ ticketRef: "500000" }).run();

    // First ref (ours) collides with the existing draw, the retry gets 250000.
    const random = spyOn(Math, "random")
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.25);

    try {
      const job = await prepareReceiptJob({ ctx: createCtx(db), input: PHOTO });

      expect(job.ticketRef).toBe("250000");
      expect(job.receiptRasterCmd.toString()).toBe("photo:250000");
      expect(
        buildReceiptRasterCommand.mock.calls.map(([args]) => args.ticketRef),
      ).toEqual(["500000", "250000"]);
    } finally {
      random.mockRestore();
    }
  });

  test("rejects an empty photo before drawing", async () => {
    const db = setupDb({ outcome: "win" });

    await expect(
      prepareReceiptJob({ ctx: createCtx(db), input: new Blob([]) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.select().from(drawTable).all()).toEqual([]);
  });
});

describe("printPreparedReceiptJob", () => {
  const job = () => ({
    draw: { outcome: "loss" as const, prize: null },
    lotteryRasterCmd: Buffer.from("lottery"),
    photoPrinted: false,
    receiptRasterCmd: Buffer.from("photo"),
    ticketRef: "123456",
  });

  test("prints the photo, then the lottery ticket", async () => {
    const prepared = job();

    await printPreparedReceiptJob({
      dryRun: false,
      job: prepared,
      printerUSBAdapter: USB_ADAPTER,
    });

    expect(printedBuffers()).toEqual(["photo", "lottery"]);
    expect(prepared.photoPrinted).toBe(true);
  });

  test("a lottery-ticket failure leaves the job resumable from the ticket", async () => {
    const prepared = job();
    printRasterReceipt
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new Error("paper out");
      });

    await expect(
      printPreparedReceiptJob({
        dryRun: false,
        job: prepared,
        printerUSBAdapter: USB_ADAPTER,
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(prepared.photoPrinted).toBe(true);

    await printPreparedReceiptJob({
      dryRun: false,
      job: prepared,
      printerUSBAdapter: USB_ADAPTER,
    });

    expect(printedBuffers()).toEqual(["photo", "lottery", "lottery"]);
  });

  test("a photo failure prints nothing else", async () => {
    const prepared = job();
    printRasterReceipt.mockImplementationOnce(async () => {
      throw new Error("usb gone");
    });

    await expect(
      printPreparedReceiptJob({
        dryRun: false,
        job: prepared,
        printerUSBAdapter: USB_ADAPTER,
      }),
    ).rejects.toMatchObject({ message: "Failed to print receipt." });
    expect(prepared.photoPrinted).toBe(false);
    expect(printedBuffers()).toEqual(["photo"]);
  });
});

describe("config.printReceipt (admin test print)", () => {
  test("prints the photo receipt under the sample ref without drawing", async () => {
    const db = setupDb({ outcome: "win" });
    const stockBefore = stockOf(db, "p1");
    const caller = engineRouter.createCaller({
      ...createCtx(db),
      requestOrigin: "https://admin.local",
    });

    await caller.config.printReceipt(PHOTO.stream() as unknown as Blob);

    expect(printedBuffers()).toEqual(["photo:000000"]);
    expect(buildLotteryTicketRasterCommand).not.toHaveBeenCalled();
    expect(db.select().from(drawTable).all()).toEqual([]);
    expect(stockOf(db, "p1")).toEqual(stockBefore);
    expect(stockBefore?.remainingQuantity).toBe(3);
  });
});

describe("prepareReceipt → printPreparedReceipt", () => {
  test("a failed print can be retried and never prints the photo twice", async () => {
    const caller = engineRouter.createCaller(
      createCtx(setupDb({ outcome: "win" })),
    );

    const prepared = await caller.booth.prepareReceipt(
      // createCaller skips the HTTP adapter, so it gets the ReadableStream the
      // octet parser checks for rather than the client-side Blob type.
      PHOTO.stream() as unknown as Blob,
    );
    expect(prepared.draw.outcome).toBe("win");

    printRasterReceipt
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new Error("paper out");
      });

    await expect(
      caller.booth.printPreparedReceipt({ ticketRef: prepared.ticketRef }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    await caller.booth.printPreparedReceipt({ ticketRef: prepared.ticketRef });

    expect(printedBuffers()).toEqual([
      `photo:${prepared.ticketRef}`,
      `lottery:${prepared.ticketRef}`,
      `lottery:${prepared.ticketRef}`,
    ]);

    // Printed in full: the job is gone.
    await expect(
      caller.booth.printPreparedReceipt({ ticketRef: prepared.ticketRef }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(preparedReceiptStore.size).toBe(0);
  });

  test("printPreparedReceipt rejects a malformed ticket ref", async () => {
    const caller = engineRouter.createCaller(
      createCtx(setupDb({ outcome: "win" })),
    );

    await expect(
      caller.booth.printPreparedReceipt({ ticketRef: "12345" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("drawLottery is no longer exposed", () => {
    expect(
      Object.keys(engineRouter._def.procedures).some((path) =>
        path.endsWith(".drawLottery"),
      ),
    ).toBe(false);
  });
});

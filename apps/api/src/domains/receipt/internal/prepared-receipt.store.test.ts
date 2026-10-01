import { describe, expect, test } from "bun:test";

import type { PreparedReceiptJob } from "./receipt-print.service";

import { createPreparedReceiptStore } from "./prepared-receipt.store";

const createJob = (ticketRef: string): PreparedReceiptJob => ({
  draw: { outcome: "loss", prize: null },
  lotteryRasterCmd: null,
  receiptRasterCmd: Buffer.from([0x01]),
  ticketRef,
});

describe("createPreparedReceiptStore", () => {
  test("hands a job back exactly once", () => {
    const store = createPreparedReceiptStore();
    const job = createJob("123456");

    store.put(job);

    expect(store.take("123456")).toBe(job);
    expect(store.take("123456")).toBeNull();
  });

  test("returns null for a ticket it never saw", () => {
    const store = createPreparedReceiptStore();

    expect(store.take("000000")).toBeNull();
  });

  test("evicts jobs once their ttl has elapsed", () => {
    let currentTime = 1_000;
    const store = createPreparedReceiptStore({
      now: () => currentTime,
      ttlMs: 100,
    });

    store.put(createJob("111111"));
    currentTime += 50;
    store.put(createJob("222222"));

    expect(store.size).toBe(2);

    currentTime += 50;

    expect(store.take("111111")).toBeNull();
    expect(store.size).toBe(1);
    expect(store.take("222222")?.ticketRef).toBe("222222");
  });
});

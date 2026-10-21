import { describe, expect, test } from "bun:test";

import {
  getLotteryForceConfig,
  isReceiptPrintDryRun,
  parseHubOverride,
  parseLotteryForceConfig,
  parseReceiptPrintDryRun,
} from "./runtime-flags";

describe("parseReceiptPrintDryRun", () => {
  test("returns false when unset or falsy", () => {
    expect(parseReceiptPrintDryRun({})).toBe(false);
    expect(parseReceiptPrintDryRun({ value: "false" })).toBe(false);
    expect(parseReceiptPrintDryRun({ value: "0" })).toBe(false);
  });

  test("returns true for truthy non-production values", () => {
    expect(
      parseReceiptPrintDryRun({ nodeEnv: "development", value: "true" }),
    ).toBe(true);
    expect(parseReceiptPrintDryRun({ nodeEnv: "test", value: "1" })).toBe(true);
    expect(
      parseReceiptPrintDryRun({ nodeEnv: "development", value: "yes" }),
    ).toBe(true);
  });

  test("rejects truthy values in production", () => {
    expect(() =>
      parseReceiptPrintDryRun({ nodeEnv: "production", value: "true" }),
    ).toThrow(/RECEIPT_PRINT_DRY_RUN/);
  });
});

describe("parseLotteryForceConfig", () => {
  test("returns null when unset", () => {
    expect(parseLotteryForceConfig({})).toBeNull();
  });

  test("forces loss", () => {
    expect(
      parseLotteryForceConfig({
        nodeEnv: "development",
        outcome: "loss",
      }),
    ).toEqual({ outcome: "loss" });
  });

  test("forces win from prize id alone", () => {
    expect(
      parseLotteryForceConfig({
        nodeEnv: "development",
        prizeId: "prize-1",
      }),
    ).toEqual({ outcome: "win", prizeId: "prize-1" });
  });

  test("forces win from outcome and prize id", () => {
    expect(
      parseLotteryForceConfig({
        nodeEnv: "development",
        outcome: "win",
        prizeId: "prize-1",
      }),
    ).toEqual({ outcome: "win", prizeId: "prize-1" });
  });

  test("rejects win without prize id", () => {
    expect(() =>
      parseLotteryForceConfig({
        nodeEnv: "development",
        outcome: "win",
      }),
    ).toThrow(/LOTTERY_FORCE_PRIZE_ID/);
  });

  test("rejects loss with prize id", () => {
    expect(() =>
      parseLotteryForceConfig({
        nodeEnv: "development",
        outcome: "loss",
        prizeId: "prize-1",
      }),
    ).toThrow(/LOTTERY_FORCE_PRIZE_ID/);
  });

  test("rejects invalid outcome", () => {
    expect(() =>
      parseLotteryForceConfig({
        nodeEnv: "development",
        outcome: "maybe",
      }),
    ).toThrow(/LOTTERY_FORCE_OUTCOME/);
  });

  test("rejects force flags in production", () => {
    expect(() =>
      parseLotteryForceConfig({
        nodeEnv: "production",
        outcome: "loss",
      }),
    ).toThrow(/LOTTERY_FORCE_OUTCOME/);

    expect(() =>
      parseLotteryForceConfig({
        nodeEnv: "production",
        prizeId: "prize-1",
      }),
    ).toThrow(/LOTTERY_FORCE_PRIZE_ID/);
  });
});

describe("parseHubOverride", () => {
  test("is none unless set, so the booth talks to the production Hub", () => {
    expect(parseHubOverride({ nodeEnv: "production" })).toBeNull();
  });

  test("points the booth at another Hub in development", () => {
    expect(
      parseHubOverride({
        nodeEnv: "development",
        url: "http://127.0.0.1:56321",
        publishableKey: "local",
      }),
    ).toEqual({ url: "http://127.0.0.1:56321", publishableKey: "local" });
  });

  test("refuses to run in production", () => {
    expect(() =>
      parseHubOverride({
        nodeEnv: "production",
        url: "http://x",
        publishableKey: "k",
      }),
    ).toThrow("HUB_URL must not be enabled when NODE_ENV=production");
  });

  test("needs both values", () => {
    expect(() =>
      parseHubOverride({ nodeEnv: "development", url: "http://x" }),
    ).toThrow("HUB_URL and HUB_PUBLISHABLE_KEY must be set together");
  });
});

describe("env readers", () => {
  test("isReceiptPrintDryRun reads from env map", () => {
    expect(
      isReceiptPrintDryRun({
        NODE_ENV: "development",
        RECEIPT_PRINT_DRY_RUN: "true",
      }),
    ).toBe(true);
  });

  test("getLotteryForceConfig reads from env map", () => {
    expect(
      getLotteryForceConfig({
        NODE_ENV: "development",
        LOTTERY_FORCE_OUTCOME: "loss",
      }),
    ).toEqual({ outcome: "loss" });
  });
});

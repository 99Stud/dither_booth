import { describe, expect, test } from "bun:test";

import { KIOSK_COMMAND_SCHEMA, kioskPageStatusSchema } from "#isomorphic/kiosk";

describe("KIOSK_COMMAND_SCHEMA", () => {
  test("parses a reload command", () => {
    const command = {
      type: "reload",
      mode: "when-idle",
      commandId: "c1",
    } as const;

    expect(KIOSK_COMMAND_SCHEMA.parse(command)).toEqual(command);
  });

  test("parses a navigate command", () => {
    const command = {
      type: "navigate",
      screen: "darkroom",
      commandId: "c1",
    } as const;

    expect(KIOSK_COMMAND_SCHEMA.parse(command)).toEqual(command);
  });

  test("parses a maintenance command", () => {
    const command = {
      type: "maintenance",
      enabled: true,
      commandId: "c1",
    } as const;

    expect(KIOSK_COMMAND_SCHEMA.parse(command)).toEqual(command);
    expect(
      KIOSK_COMMAND_SCHEMA.safeParse({ ...command, enabled: "yes" }).success,
    ).toBe(false);
  });

  test("rejects an unknown command, reload mode or screen", () => {
    expect(
      KIOSK_COMMAND_SCHEMA.safeParse({ type: "shutdown", commandId: "c1" })
        .success,
    ).toBe(false);
    expect(
      KIOSK_COMMAND_SCHEMA.safeParse({
        type: "reload",
        mode: "later",
        commandId: "c1",
      }).success,
    ).toBe(false);
    expect(
      KIOSK_COMMAND_SCHEMA.safeParse({
        type: "navigate",
        screen: "sandbox",
        commandId: "c1",
      }).success,
    ).toBe(false);
  });
});

describe("kioskPageStatusSchema", () => {
  test("requires whether the page shows maintenance", () => {
    expect(
      kioskPageStatusSchema.safeParse({ camera: null, maintenance: false })
        .success,
    ).toBe(true);
    expect(kioskPageStatusSchema.safeParse({ camera: null }).success).toBe(
      false,
    );
  });
});

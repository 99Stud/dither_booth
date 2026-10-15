import { describe, expect, test } from "bun:test";

import { KIOSK_COMMAND_SCHEMA } from "#isomorphic/kiosk";

describe("KIOSK_COMMAND_SCHEMA", () => {
  test("parses a reload command", () => {
    const command = {
      type: "reload",
      mode: "when-idle",
      commandId: "c1",
    } as const;

    expect(KIOSK_COMMAND_SCHEMA.parse(command)).toEqual(command);
  });

  test("rejects an unknown command or reload mode", () => {
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
  });
});

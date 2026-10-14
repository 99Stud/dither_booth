import { describe, expect, test } from "bun:test";

import {
  createBoothTicketRef,
  isUniqueTicketRefConstraintError,
} from "./lottery.ticket-ref";

describe("createBoothTicketRef", () => {
  test("never yields the 000000 sample ref", () => {
    expect(createBoothTicketRef(() => 0)).toBe("000001");
  });

  test("tops out at 999999", () => {
    expect(createBoothTicketRef(() => 0.999_999_999)).toBe("999999");
  });

  test("always yields 6 digits in range", () => {
    for (let i = 0; i < 5_000; i++) {
      const ref = createBoothTicketRef();
      expect(ref).toMatch(/^\d{6}$/);
      expect(ref).not.toBe("000000");
    }
  });
});

describe("isUniqueTicketRefConstraintError", () => {
  test("matches SQLite unique violations on ticket_ref only", () => {
    expect(
      isUniqueTicketRefConstraintError(
        new Error("UNIQUE constraint failed: draw.ticket_ref"),
      ),
    ).toBe(true);
    expect(
      isUniqueTicketRefConstraintError(
        new Error("UNIQUE constraint failed: draw.id"),
      ),
    ).toBe(false);
    expect(isUniqueTicketRefConstraintError("ticket_ref")).toBe(false);
  });
});

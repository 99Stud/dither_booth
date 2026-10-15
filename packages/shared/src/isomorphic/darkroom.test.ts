import { describe, expect, test } from "bun:test";

import { darkroomPinSchema } from "#isomorphic/darkroom";

describe("darkroomPinSchema", () => {
  test("accepts 4 to 8 digits", () => {
    for (const pin of ["2468", "12345678"]) {
      expect(darkroomPinSchema.safeParse(pin).success).toBe(true);
    }
  });

  test("rejects letters, too short or too long", () => {
    for (const pin of ["123", "123456789", "12a4", " 1234"]) {
      expect(darkroomPinSchema.safeParse(pin).success).toBe(false);
    }
  });
});

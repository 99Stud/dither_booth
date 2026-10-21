import { describe, expect, test } from "bun:test";

import {
  hashRegistrationCode,
  registrationCodeSchema,
} from "#isomorphic/registration";

describe("registrationCodeSchema", () => {
  test.each([
    ["7KQ2M-9XD4T", "7KQ2M9XD4T"],
    ["7kq2m 9xd4t", "7KQ2M9XD4T"],
    [" 7KQ2M9XD4T ", "7KQ2M9XD4T"],
    ["OIL2M-9XD4T", "0112M9XD4T"],
  ])("reads %j as %s", (typed, code) => {
    expect(registrationCodeSchema.parse(typed)).toBe(code);
  });

  test.each([["7KQ2M-9XD4"], ["7KQ2M-9XD4TT"], ["7KQ2M-9XD4U"], [""]])(
    "refuses %j",
    (typed) => {
      expect(registrationCodeSchema.safeParse(typed).success).toBe(false);
    },
  );
});

describe("hashRegistrationCode", () => {
  test("is the sha256 the Hub stores (hex, as Postgres' digest gives it)", async () => {
    expect(await hashRegistrationCode("7KQ2M9XD4T")).toBe(
      new Bun.CryptoHasher("sha256").update("7KQ2M9XD4T").digest("hex"),
    );
  });
});

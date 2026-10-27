import { describe, expect, test } from "bun:test";

import {
  formatStartEnd,
  fromTimeInput,
  isEndAfterStart,
  toTimeInput,
} from "./start-end.utils";

/** The booth's clock, local time. */
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const iso = (day: number, h: number, m = 0) => at(day, h, m).toISOString();

describe("toTimeInput and fromTimeInput", () => {
  test("go between ISO and the local date-time field, empty meaning open", () => {
    expect(toTimeInput(iso(31, 19, 5))).toBe("2026-10-31T19:05");
    expect(fromTimeInput("2026-10-31T19:05")).toBe(iso(31, 19, 5));
    expect(toTimeInput(null)).toBe("");
    expect(fromTimeInput("")).toBeNull();
  });
});

describe("isEndAfterStart", () => {
  test("needs the end after the start, and lets either side stay open", () => {
    expect(
      isEndAfterStart({
        startsAt: "2026-10-31T19:00",
        endsAt: "2026-11-01T02:00",
      }),
    ).toBe(true);
    expect(
      isEndAfterStart({
        startsAt: "2026-10-31T19:00",
        endsAt: "2026-10-31T19:00",
      }),
    ).toBe(false);
    expect(isEndAfterStart({ startsAt: "", endsAt: "2026-10-31T19:00" })).toBe(
      true,
    );
    expect(isEndAfterStart({ startsAt: "2026-10-31T19:00", endsAt: "" })).toBe(
      true,
    );
  });
});

describe("formatStartEnd", () => {
  test("says one evening once, even past midnight", () => {
    expect(
      formatStartEnd({ startsAt: iso(31, 19), endsAt: iso(31, 23, 30) }),
    ).toBe("Sat 31 Oct, 19:00 to 23:30");
    expect(
      formatStartEnd({
        startsAt: iso(31, 19),
        endsAt: new Date(2026, 10, 1, 2).toISOString(),
      }),
    ).toBe("Sat 31 Oct, 19:00 to 02:00");
  });

  test("names both days when it lasts longer", () => {
    expect(formatStartEnd({ startsAt: iso(30, 10), endsAt: iso(31, 18) })).toBe(
      "Fri 30 Oct, 10:00 to Sat 31 Oct, 18:00",
    );
  });

  test("says an open side as from or until, and nothing without either", () => {
    expect(formatStartEnd({ startsAt: iso(31, 19), endsAt: null })).toBe(
      "From Sat 31 Oct, 19:00",
    );
    expect(formatStartEnd({ startsAt: null, endsAt: iso(31, 23) })).toBe(
      "Until Sat 31 Oct, 23:00",
    );
    expect(formatStartEnd({ startsAt: null, endsAt: null })).toBeNull();
  });
});

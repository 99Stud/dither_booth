import { describe, expect, test } from "bun:test";

import {
  formatHour,
  formatHourRange,
  formatVisitLength,
  getBusiestHour,
} from "./guests.utils";

const hour = (h: number, visits: number) => ({
  hour: new Date(2026, 9, 31, h).toISOString(),
  visits,
});

describe("formatVisitLength", () => {
  test("reads as minutes and seconds", () => {
    expect(formatVisitLength(6)).toBe("0:06");
    expect(formatVisitLength(65)).toBe("1:05");
    expect(formatVisitLength(600)).toBe("10:00");
  });
});

describe("formatHour and formatHourRange", () => {
  test("read the booth's 24-hour clock", () => {
    expect(formatHour(hour(22, 0).hour)).toBe("22:00");
    expect(formatHourRange(hour(23, 0).hour)).toBe("23:00–00:00");
  });
});

describe("getBusiestHour", () => {
  test("is null before the first guest", () => {
    expect(getBusiestHour([hour(20, 0), hour(21, 0)])).toBeNull();
  });

  test("picks the hour with the most guests, the latest on a tie", () => {
    expect(getBusiestHour([hour(20, 4), hour(21, 9), hour(22, 9)])).toEqual(
      hour(22, 9),
    );
  });
});

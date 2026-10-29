import { describe, expect, it } from "bun:test";

import { createJobFixture } from "./update.testing";
import { getJobProgress, getJobSteps, getUpdateWarnings } from "./update.utils";

const NOW = Date.parse("2026-10-31T18:00:00.000Z");
const hours = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

describe("job steps", () => {
  it("lists an update's steps, and `rollback` only once it began", () => {
    expect(getJobSteps(createJobFixture({ step: "download" }))).not.toContain(
      "rollback",
    );
    expect(getJobSteps(createJobFixture({ step: "rollback" }))).toContain(
      "rollback",
    );
  });

  it("lists a rollback's three steps", () => {
    expect(
      getJobSteps(createJobFixture({ kind: "rollback", step: "restart" })),
    ).toEqual(["switch", "restart", "check"]);
  });

  it("measures progress by the steps behind", () => {
    expect(getJobProgress(null)).toBe(0);
    expect(getJobProgress(createJobFixture({ step: "backup" }))).toBe(44);
    expect(getJobProgress(createJobFixture({ step: "check" }))).toBe(89);
  });
});

describe("getUpdateWarnings", () => {
  it("warns during the event, including one with an open end", () => {
    expect(
      getUpdateWarnings({
        event: { startsAt: hours(-1), endsAt: hours(2) },
        recentVisits: 0,
        printing: false,
        now: NOW,
      }).map((warning) => warning.id),
    ).toEqual(["event"]);
    expect(
      getUpdateWarnings({
        event: { startsAt: hours(-1), endsAt: null },
        recentVisits: 0,
        printing: false,
        now: NOW,
      }),
    ).toHaveLength(1);
    expect(
      getUpdateWarnings({
        event: { startsAt: hours(1), endsAt: hours(3) },
        recentVisits: 0,
        printing: false,
        now: NOW,
      }),
    ).toHaveLength(0);
  });

  it("warns about guests and a print in progress, and says nothing when unknown", () => {
    expect(
      getUpdateWarnings({
        event: null,
        recentVisits: 1,
        printing: true,
        now: NOW,
      }).map((warning) => warning.id),
    ).toEqual(["visits", "printing"]);
    expect(
      getUpdateWarnings({
        event: null,
        recentVisits: null,
        printing: null,
        now: NOW,
      }),
    ).toHaveLength(0);
  });
});

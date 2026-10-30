import { describe, expect, test } from "bun:test";

import {
  EventClash,
  type EventDraft,
  eventErrorMessage,
  eventPhase,
  eventWindow,
  onCallBadge,
} from "#lib/events";
import {
  onCallErrorMessage,
  type OnCallMember,
  onCallStatus,
  onCallSummary,
} from "#lib/on-call";

// Built in this device's time zone, as Studio shows them.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const halloween = { startsAt: at(31, 18), endsAt: at(32, 2) };

describe("eventPhase", () => {
  test.each([
    [at(31, 17, 59), "upcoming"],
    [at(31, 18), "live"],
    [at(32, 1, 59), "live"],
    // Half-open, as on the Hub: at its end, it's over.
    [at(32, 2), "past"],
  ] as const)("at %s it is %s", (now, phase) => {
    expect(eventPhase(halloween, new Date(now).getTime())).toBe(phase);
  });
});

describe("eventWindow", () => {
  test("a night reads with one date", () => {
    expect(eventWindow(halloween)).toBe("Sat 31 Oct, 18:00 to 02:00");
  });

  test("a weekend reads with both", () => {
    expect(eventWindow({ startsAt: at(30, 18), endsAt: at(32, 2) })).toBe(
      "Fri 30 Oct, 18:00 to Sun 1 Nov, 02:00",
    );
  });
});

describe("onCallBadge", () => {
  test.each([
    [0, "Whole team"],
    [1, "1 on call"],
    [3, "3 on call"],
  ])("%i reads %s", (count, label) => {
    expect(onCallBadge(count)).toBe(label);
  });
});

describe("eventErrorMessage", () => {
  const draft: EventDraft = {
    clientId: "b",
    boothId: "a1",
    name: "Halloween",
    ...halloween,
  };

  test("a clash found before saving names the event already there", () => {
    expect(
      eventErrorMessage(new EventClash("Open day"), draft, "Booth B"),
    ).toBe("Booth B already has Open day then. Pick another booth or time.");
  });

  test.each([
    ["23P01", "Booth B already has an event then. Pick another booth or time."],
    [
      "23503",
      "Can't move Halloween to Booth B: its on-call staff are in another team. Take them off call first.",
    ],
    [
      "23514",
      "Check the name (120 characters at most) and that it ends after it starts.",
    ],
    ["42501", "Only platform admins book events."],
  ])("%s", (code, message) => {
    expect(eventErrorMessage({ code }, draft, "Booth B")).toBe(message);
  });

  test("anything else says what failed and how to fix it", () => {
    expect(
      eventErrorMessage(new Error("Failed to fetch"), draft, "Booth B"),
    ).toBe(
      "Couldn't save Halloween: Failed to fetch. Check your connection and try again.",
    );
  });
});

const member = (overrides: Partial<OnCallMember> = {}): OnCallMember => ({
  userId: "u1",
  email: "lea@example.com",
  role: "member",
  you: false,
  devices: 1,
  signedIn: true,
  addedAt: "2026-10-29T10:00:00Z",
  onCall: false,
  ...overrides,
});

describe("onCallSummary", () => {
  test("nobody on call: the whole team", () => {
    expect(onCallSummary([member()], "Booth A", "Halloween")).toEqual({
      reaching: 0,
      text: "Nobody on call: the whole team gets Booth A's alerts.",
      tone: "off",
    });
  });

  test("on call with a device: they get the alerts", () => {
    expect(
      onCallSummary(
        [
          member({ onCall: true }),
          member({ userId: "u2", onCall: true, devices: 0 }),
        ],
        "Booth A",
        "Halloween",
      ),
    ).toEqual({
      reaching: 2,
      text: "They get Booth A's alerts during Halloween.",
      tone: "ok",
    });
  });

  test.each([
    [1, "They have no device yet, so the whole team gets the alerts."],
    [2, "None of them has a device yet, so the whole team gets the alerts."],
  ])("%i on call without a device: warns of the fallback", (count, text) => {
    const team = Array.from({ length: count }, (_, i) =>
      member({ userId: `u${i}`, onCall: true, devices: 0 }),
    );
    // The badge says what the Hub does: the whole team.
    expect(onCallSummary(team, "Booth A", "Halloween")).toEqual({
      reaching: 0,
      text,
      tone: "warn",
    });
  });
});

describe("onCallErrorMessage", () => {
  test("a refusal says who may", () => {
    expect(onCallErrorMessage({ code: "42501" }, "lea@example.com", true)).toBe(
      "Only platform admins change who's on call.",
    );
  });

  test.each([
    [
      true,
      "Couldn't put lea@example.com on call: Failed to fetch. Check your connection and try again.",
    ],
    [
      false,
      "Couldn't take lea@example.com off call: Failed to fetch. Check your connection and try again.",
    ],
  ])("a failed switch (on: %s) says what didn't happen", (onCall, message) => {
    expect(
      onCallErrorMessage(
        new Error("Failed to fetch"),
        "lea@example.com",
        onCall,
      ),
    ).toBe(message);
  });
});

describe("onCallStatus", () => {
  test.each([
    [
      { onCall: true, devices: 0 },
      "No device yet: won't get alerts until they turn on notifications",
      "warn",
    ],
    [
      { onCall: true, devices: 0, signedIn: false },
      "Hasn't signed in yet: won't get alerts",
      "warn",
    ],
    [
      { onCall: false, devices: 0, signedIn: false },
      "Hasn't signed in yet",
      "off",
    ],
    [{ onCall: true, devices: 2 }, "2 devices", "ok"],
  ] as const)("%o reads %s", (overrides, text, tone) => {
    expect(onCallStatus(member(overrides))).toEqual({ text, tone });
  });
});

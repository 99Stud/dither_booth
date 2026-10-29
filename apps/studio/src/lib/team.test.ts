import { describe, expect, test } from "bun:test";

import {
  addErrorMessage,
  memberStatus,
  shareMessage,
  TeamError,
  type TeamMember,
  teamSummary,
} from "#lib/team";

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  userId: "u1",
  email: "lea@example.com",
  role: "member",
  you: false,
  devices: 1,
  signedIn: true,
  addedAt: "2026-10-29T10:00:00Z",
  ...overrides,
});

describe("memberStatus", () => {
  test.each([
    [{ signedIn: false, devices: 0 }, "Hasn't signed in yet", "off"],
    [{ devices: 0 }, "No device yet: won't get alerts", "warn"],
    [{ devices: 1 }, "1 device", "ok"],
    [{ devices: 3 }, "3 devices", "ok"],
    // A device is what counts, whatever Auth last recorded.
    [{ signedIn: false, devices: 1 }, "1 device", "ok"],
  ] as const)("%o", (overrides, text, tone) => {
    expect(memberStatus(member(overrides))).toEqual({ text, tone });
  });
});

describe("teamSummary", () => {
  test("counts the members whose phones ring", () => {
    expect(
      teamSummary([
        member(),
        member({ devices: 2 }),
        member({ devices: 0 }),
        member({ signedIn: false, devices: 0 }),
      ]),
    ).toBe("4 members · 2 get alerts");
  });

  test("reads right for one", () => {
    expect(teamSummary([member()])).toBe("1 member · 1 gets alerts");
    expect(teamSummary([member({ devices: 0 })])).toBe(
      "1 member · 0 get alerts",
    );
  });
});

test("shareMessage says where, with which address, and what next", () => {
  expect(
    shareMessage("99Stud", "lea@example.com", "studio.ditherbooth.com"),
  ).toBe(
    "You're on the 99Stud team in Studio, Dither Booth's alerts app. " +
      "Open studio.ditherbooth.com, sign in with lea@example.com and the " +
      "code we email you, then turn on notifications in This device.",
  );
});

describe("addErrorMessage", () => {
  test.each([
    [
      new TeamError("already in the team", 409, "already-member"),
      "lea@example.com is already in 99Stud.",
    ],
    [
      new TeamError("that address is a booth's login", 422, "booth-login"),
      "That address belongs to a booth, not a person.",
    ],
    [
      new TeamError("invalid request", 400),
      "Enter an email address, like lea@example.com.",
    ],
    [
      new TeamError("only owners", 403),
      "Only owners and platform admins add people.",
    ],
    [
      new Error("Failed to fetch"),
      "Couldn't add lea@example.com: Failed to fetch",
    ],
    [null, "Couldn't add lea@example.com. Check the connection and try again."],
  ])("%p", (error, message) => {
    expect(addErrorMessage(error, "lea@example.com", "99Stud")).toBe(message);
  });
});

import { assertEquals } from "@std/assert";

import type { StoredMember } from "../_shared/members.ts";

import { handleOnCall, type OnCallDeps } from "./handler.ts";

const TEAM = "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f";
const EVENT = "e1000000-0000-4000-8000-0000000000e1";
const LEA = "0a000000-0000-4000-8000-000000000001";
const TOM = "0a000000-0000-4000-8000-000000000002";
const SAM = "0a000000-0000-4000-8000-000000000003";
const ADMIN = "0a000000-0000-4000-8000-000000000004";
const CLIENT = "0a000000-0000-4000-8000-000000000005";

const member = (
  userId: string,
  email: string,
  devices = 0,
  role: "owner" | "member" = "member",
): StoredMember => ({
  userId,
  email,
  role,
  devices,
  signedIn: true,
  addedAt: "2026-10-29T10:00:00Z",
});

const HALLOWEEN = {
  id: EVENT,
  name: "Halloween",
  boothName: "Booth A",
  startsAt: "2026-10-31T18:00:00+00:00",
  endsAt: "2026-11-01T02:00:00+00:00",
};

/** Booth A's team: Lea, Tom (an owner) and Sam; Lea is on call. */
function setup(overrides: Partial<OnCallDeps> = {}) {
  const team = [
    member(SAM, "sam@example.com"),
    member(TOM, "tom@example.com", 2, "owner"),
    member(LEA, "lea@example.com", 1),
  ];
  const deps: OnCallDeps = {
    authenticate: (token) =>
      Promise.resolve(
        { lea: LEA, sam: SAM, admin: ADMIN, client: CLIENT }[token] ?? null,
      ),
    isPlatformAdmin: (userId) => Promise.resolve(userId === ADMIN),
    roleIn: (userId, orgId) =>
      Promise.resolve(
        orgId === TEAM
          ? (team.find((row) => row.userId === userId)?.role ?? null)
          : null,
      ),
    findEvent: (eventId) =>
      Promise.resolve(
        eventId === EVENT ? { ...HALLOWEEN, boothOrgId: TEAM } : null,
      ),
    listMembers: () => Promise.resolve(team.map((row) => ({ ...row }))),
    onCallIds: () => Promise.resolve([LEA]),
    ...overrides,
  };
  return deps;
}

const call = (query: { eventId?: string }, token?: string, method = "GET") =>
  new Request(
    `https://hub.test/functions/v1/on-call?${new URLSearchParams(query)}`,
    {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

Deno.test("refuses anything but GET", async () => {
  const res = await handleOnCall(
    call({ eventId: EVENT }, "lea", "POST"),
    setup(),
  );
  assertEquals(res.status, 405);
});

Deno.test("asks to sign in first", async () => {
  const res = await handleOnCall(call({ eventId: EVENT }), setup());
  assertEquals(res.status, 401);
});

Deno.test("refuses a request without an event", async () => {
  const res = await handleOnCall(
    call({ eventId: "halloween" }, "lea"),
    setup(),
  );
  assertEquals(res.status, 400);
});

Deno.test("an event that doesn't exist is unknown, even to an admin", async () => {
  const res = await handleOnCall(
    call({ eventId: "e2000000-0000-4000-8000-0000000000e2" }, "admin"),
    setup(),
  );
  assertEquals(res.status, 404);
});

Deno.test("the client's team doesn't see who runs its event", async () => {
  const res = await handleOnCall(call({ eventId: EVENT }, "client"), setup());
  assertEquals(res.status, 404);
});

Deno.test("the booth's team reads it: the caller first, then by email", async () => {
  const res = await handleOnCall(call({ eventId: EVENT }, "sam"), setup());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.event, HALLOWEEN);
  assertEquals(
    body.team.map(
      (row: { email: string; you: boolean; onCall: boolean }) =>
        `${row.email} you=${row.you} onCall=${row.onCall}`,
    ),
    [
      "sam@example.com you=true onCall=false",
      "lea@example.com you=false onCall=true",
      "tom@example.com you=false onCall=false",
    ],
  );
});

Deno.test("a platform admin outside the team reads it", async () => {
  const res = await handleOnCall(call({ eventId: EVENT }, "admin"), setup());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.team.length, 3);
  assertEquals(body.event.boothOrgId, undefined);
});

Deno.test("answers 500 when the Hub can't read", async () => {
  const res = await handleOnCall(
    call({ eventId: EVENT }, "lea"),
    setup({ onCallIds: () => Promise.reject(new Error("down")) }),
  );
  assertEquals(res.status, 500);
});

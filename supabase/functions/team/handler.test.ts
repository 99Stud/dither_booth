import { assertEquals } from "@std/assert";

import { handleTeam, type StoredMember, type TeamDeps } from "./handler.ts";

const ORG = "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f";
const OTHER_ORG = "c0ffee00-0000-4000-8000-000000000001";
const OWNER = "0a000000-0000-4000-8000-000000000001";
const LEA = "0a000000-0000-4000-8000-000000000002";
const TOM = "0a000000-0000-4000-8000-000000000003";
const ADMIN = "0a000000-0000-4000-8000-000000000004";
const NEW = "0a000000-0000-4000-8000-000000000005";

const member = (
  userId: string,
  email: string,
  role: "owner" | "member" = "member",
): StoredMember => ({
  userId,
  email,
  role,
  devices: 0,
  signedIn: true,
  addedAt: "2026-10-29T10:00:00Z",
});

/** A team of an owner and two members; an admin outside it. */
function setup(overrides: Partial<TeamDeps> = {}) {
  const forgotten: string[] = [];
  const members = [
    member(TOM, "tom@example.com"),
    member(LEA, "lea@example.com"),
    member(OWNER, "owner@example.com", "owner"),
  ];
  const users = new Map([
    ["lea@example.com", LEA],
    ["owner@example.com", OWNER],
    ["tom@example.com", TOM],
  ]);
  const deps: TeamDeps = {
    authenticate: (token) =>
      Promise.resolve({ owner: OWNER, lea: LEA, admin: ADMIN }[token] ?? null),
    isPlatformAdmin: (userId) => Promise.resolve(userId === ADMIN),
    roleIn: (userId, orgId) =>
      Promise.resolve(
        orgId === ORG
          ? (members.find((row) => row.userId === userId)?.role ?? null)
          : null,
      ),
    teamName: (orgId) => Promise.resolve(orgId === ORG ? "99Stud" : null),
    listMembers: () => Promise.resolve(members.map((row) => ({ ...row }))),
    findOrCreateUser: (email) => {
      const known = users.get(email);
      if (email.endsWith("@booths.dither.invalid")) {
        return Promise.resolve({ userId: NEW, created: false, isBooth: true });
      }
      if (known) {
        return Promise.resolve({
          userId: known,
          created: false,
          isBooth: false,
        });
      }
      users.set(email, NEW);
      return Promise.resolve({ userId: NEW, created: true, isBooth: false });
    },
    forgetUser: (userId) => {
      forgotten.push(userId);
      return Promise.resolve();
    },
    addMember: (_orgId, userId, role) => {
      if (members.some((row) => row.userId === userId)) {
        return Promise.resolve(false);
      }
      const email = [...users].find(([, id]) => id === userId)![0];
      members.push({ ...member(userId, email, role), signedIn: false });
      return Promise.resolve(true);
    },
    removeMember: (_orgId, userId) => {
      const at = members.findIndex((row) => row.userId === userId);
      if (at < 0) return Promise.resolve(false);
      members.splice(at, 1);
      return Promise.resolve(true);
    },
    setRole: (_orgId, userId, role) => {
      const row = members.find((candidate) => candidate.userId === userId);
      if (!row) return Promise.resolve(false);
      row.role = role;
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { deps, members, forgotten };
}

const post = (body: unknown, token?: string) =>
  new Request("https://hub.test/functions/v1/team", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

Deno.test("a member reads the team: themselves first, then owners, then by email", async () => {
  const { deps } = setup();
  const res = await handleTeam(
    post({ action: "list", orgId: ORG }, "lea"),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.team, { id: ORG, name: "99Stud" });
  assertEquals(body.canManage, false);
  assertEquals(
    body.members.map((row: { email: string; you: boolean }) => [
      row.email,
      row.you,
    ]),
    [
      ["lea@example.com", true],
      ["owner@example.com", false],
      ["tom@example.com", false],
    ],
  );
});

Deno.test("an owner and an admin outside the team may manage it", async () => {
  const { deps } = setup();
  for (const token of ["owner", "admin"]) {
    const res = await handleTeam(
      post({ action: "list", orgId: ORG }, token),
      deps,
    );
    assertEquals((await res.json()).canManage, true);
  }
});

Deno.test("another team answers like a team that doesn't exist", async () => {
  const { deps } = setup();
  assertEquals(
    (
      await handleTeam(
        post({ action: "list", orgId: OTHER_ORG }, "owner"),
        deps,
      )
    ).status,
    404,
  );
});

Deno.test("a team that doesn't exist answers 404, even to an admin", async () => {
  const { deps } = setup();
  const res = await handleTeam(
    post({ action: "list", orgId: OTHER_ORG }, "admin"),
    deps,
  );
  assertEquals(res.status, 404);
});

Deno.test("a login made for an add that fails goes with it", async () => {
  const { deps, forgotten } = setup({
    addMember: () => Promise.reject(new Error("connection reset")),
  });
  const original = console.error;
  console.error = () => {};
  try {
    const fresh = await handleTeam(
      post({ action: "add", orgId: ORG, email: "sam@example.com" }, "owner"),
      deps,
    );
    // An existing login stays: it may be on another team.
    const known = await handleTeam(
      post({ action: "add", orgId: ORG, email: "tom@example.com" }, "owner"),
      deps,
    );
    assertEquals([fresh.status, known.status], [500, 500]);
    assertEquals(forgotten, [NEW]);
  } finally {
    console.error = original;
  }
});

Deno.test("an owner adds someone new, who has no sign-in yet", async () => {
  const { deps, members } = setup();
  const res = await handleTeam(
    post({ action: "add", orgId: ORG, email: "  Sam@Example.com " }, "owner"),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.created, true);
  assertEquals(
    [body.member.email, body.member.role, body.member.signedIn],
    ["sam@example.com", "member", false],
  );
  assertEquals(members.length, 4);
});

Deno.test("adding an address that already has a login says so", async () => {
  const { deps, members } = setup();
  members.splice(
    members.findIndex((row) => row.userId === TOM),
    1,
  );
  const res = await handleTeam(
    post(
      { action: "add", orgId: ORG, email: "tom@example.com", role: "owner" },
      "admin",
    ),
    deps,
  );
  const body = await res.json();
  assertEquals(
    [res.status, body.created, body.member.role],
    [200, false, "owner"],
  );
});

Deno.test("refuses a member already in, a booth's login, and a bad address", async () => {
  const { deps, members } = setup();
  const cases: [unknown, number, string | undefined][] = [
    [{ email: "lea@example.com" }, 409, "already-member"],
    [{ email: "booth-1@booths.dither.invalid" }, 422, "booth-login"],
    [{ email: "not an address" }, 400, undefined],
  ];
  for (const [extra, status, reason] of cases) {
    const res = await handleTeam(
      post({ action: "add", orgId: ORG, ...(extra as object) }, "owner"),
      deps,
    );
    assertEquals([res.status, (await res.json()).reason], [status, reason]);
  }
  assertEquals(members.length, 3);
});

Deno.test("a member can't change the team", async () => {
  const { deps, members } = setup();
  for (const body of [
    { action: "add", orgId: ORG, email: "sam@example.com" },
    { action: "remove", orgId: ORG, userId: TOM },
    { action: "set-role", orgId: ORG, userId: TOM, role: "owner" },
  ]) {
    assertEquals((await handleTeam(post(body, "lea"), deps)).status, 403);
  }
  assertEquals(members.length, 3);
});

Deno.test("an owner promotes and removes others, never themselves", async () => {
  const { deps, members } = setup();
  const promoted = await handleTeam(
    post(
      { action: "set-role", orgId: ORG, userId: LEA, role: "owner" },
      "owner",
    ),
    deps,
  );
  assertEquals((await promoted.json()).member.role, "owner");

  const removed = await handleTeam(
    post({ action: "remove", orgId: ORG, userId: TOM }, "owner"),
    deps,
  );
  assertEquals(
    [removed.status, (await removed.json()).member.email],
    [200, "tom@example.com"],
  );
  assertEquals(
    (
      await handleTeam(
        post({ action: "remove", orgId: ORG, userId: TOM }, "owner"),
        deps,
      )
    ).status,
    404,
  );

  for (const body of [
    { action: "remove", orgId: ORG, userId: OWNER },
    { action: "set-role", orgId: ORG, userId: OWNER, role: "member" },
  ]) {
    const res = await handleTeam(post(body, "owner"), deps);
    assertEquals([res.status, (await res.json()).reason], [422, "own-row"]);
  }
  assertEquals(members.map((row) => row.userId).sort(), [LEA, OWNER].sort());
});

Deno.test("refuses a caller who isn't signed in, and anything but POST", async () => {
  const { deps } = setup();
  assertEquals(
    (await handleTeam(post({ action: "list", orgId: ORG }), deps)).status,
    401,
  );
  assertEquals(
    (await handleTeam(post({ action: "list", orgId: ORG }, "nope"), deps))
      .status,
    401,
  );
  assertEquals(
    (
      await handleTeam(
        new Request("https://hub.test/", { method: "OPTIONS" }),
        deps,
      )
    ).status,
    204,
  );
  assertEquals(
    (
      await handleTeam(
        new Request("https://hub.test/", { method: "GET" }),
        deps,
      )
    ).status,
    405,
  );
});

Deno.test("a failure answers 500 without its cause", async () => {
  const { deps } = setup({
    listMembers: () => Promise.reject(new Error("service_role=secret")),
  });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleTeam(
      post({ action: "list", orgId: ORG }, "lea"),
      deps,
    );
    assertEquals(
      [res.status, await res.json()],
      [500, { error: "the Hub couldn't do that, try again" }],
    );
  } finally {
    console.error = original;
  }
});

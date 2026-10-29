import { assertEquals } from "@std/assert";

import { type BoothCodeDeps, handleBoothCode } from "./handler.ts";

const BOOTH = "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f";
const ORG = "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f";

function setup(overrides: Partial<BoothCodeDeps> = {}) {
  const issued: string[] = [];
  const deps: BoothCodeDeps = {
    authenticate: (token) =>
      Promise.resolve(token === "staff" ? "user-a" : null),
    findBooth: (id) =>
      Promise.resolve(id === BOOTH ? { orgId: ORG, name: "Booth A" } : null),
    seesOrg: (userId, orgId) =>
      Promise.resolve(userId === "user-a" && orgId === ORG),
    issueCode: (id) => (
      issued.push(id),
      Promise.resolve({
        code: "7KQ2M-9XD4T",
        expiresAt: "2026-11-01T18:00:00Z",
      })
    ),
    ...overrides,
  };
  return { deps, issued };
}

const post = (body: unknown, token?: string) =>
  new Request("https://hub.test/functions/v1/booth-code", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

Deno.test("staff of the booth's org get a code for it", async () => {
  const { deps, issued } = setup();
  const res = await handleBoothCode(post({ boothId: BOOTH }, "staff"), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    boothName: "Booth A",
    code: "7KQ2M-9XD4T",
    expiresAt: "2026-11-01T18:00:00Z",
  });
  assertEquals(issued, [BOOTH]);
});

Deno.test("another org's booth answers like a booth that doesn't exist", async () => {
  const { deps, issued } = setup({ seesOrg: () => Promise.resolve(false) });
  assertEquals(
    (await handleBoothCode(post({ boothId: BOOTH }, "staff"), deps)).status,
    404,
  );
  assertEquals(
    (
      await handleBoothCode(
        post({ boothId: "c0ffee00-0000-4000-8000-000000000001" }, "staff"),
        setup().deps,
      )
    ).status,
    404,
  );
  assertEquals(issued.length, 0);
});

Deno.test("refuses a caller who isn't signed in, and a malformed request", async () => {
  const { deps, issued } = setup();
  assertEquals(
    (await handleBoothCode(post({ boothId: BOOTH }), deps)).status,
    401,
  );
  assertEquals(
    (await handleBoothCode(post({ boothId: BOOTH }, "nope"), deps)).status,
    401,
  );
  assertEquals(
    (await handleBoothCode(post({ boothId: "nope" }, "staff"), deps)).status,
    400,
  );
  assertEquals(issued.length, 0);
});

Deno.test("answers the browser's preflight, and only POST", async () => {
  const { deps } = setup();
  assertEquals(
    (
      await handleBoothCode(
        new Request("https://hub.test/", { method: "OPTIONS" }),
        deps,
      )
    ).status,
    204,
  );
  assertEquals(
    (
      await handleBoothCode(
        new Request("https://hub.test/", { method: "GET" }),
        deps,
      )
    ).status,
    405,
  );
});

Deno.test("a failure to issue answers 500 without its cause", async () => {
  const { deps } = setup({
    issueCode: () => Promise.reject(new Error("service_role=secret")),
  });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleBoothCode(post({ boothId: BOOTH }, "staff"), deps);
    assertEquals(
      [res.status, await res.json()],
      [500, { error: "couldn't issue a code, try again" }],
    );
  } finally {
    console.error = original;
  }
});

import {
  type CurrentEvent,
  type Heartbeat,
} from "@dither-booth/protocol/heartbeat";
import { HEARTBEAT_FIXTURES } from "@dither-booth/protocol/heartbeat.fixtures";
import { assertEquals } from "@std/assert";

import { type BoothAuth, handleHeartbeat } from "./handler.ts";

const BOOTH = "a0a0a0a0-0000-0000-0000-0000000000a0";

function setup(
  auth: BoothAuth = { boothId: BOOTH },
  update: { release: string } | null = null,
  event: CurrentEvent | null = null,
) {
  const evaluated: { boothId: string; heartbeat: Heartbeat }[] = [];
  const reported: string[] = [];
  const deps = {
    authenticate: (_token: string) => Promise.resolve(auth),
    evaluate: (boothId: string, heartbeat: Heartbeat) => {
      evaluated.push({ boothId, heartbeat });
      return Promise.resolve("ok" as const);
    },
    reportUpdate: (boothId: string, _heartbeat: Heartbeat) => {
      reported.push(boothId);
      return Promise.resolve(update);
    },
    currentEvent: (_boothId: string) => Promise.resolve(event),
  };
  return { deps, evaluated, reported };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://hub.test/functions/v1/heartbeat", {
    method: "POST",
    headers: { Authorization: "Bearer token", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("stores a booth's heartbeat and answers 200", async () => {
  const { deps, evaluated } = setup();
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.paperOut), deps);
  assertEquals(res.status, 200);
  assertEquals(evaluated, [
    { boothId: BOOTH, heartbeat: HEARTBEAT_FIXTURES.paperOut },
  ]);
});

Deno.test("answers with the release Studio asked the booth to install", async () => {
  const { deps, reported } = setup({ boothId: BOOTH }, { release: "0.8.0" });
  const res = await handleHeartbeat(
    post(HEARTBEAT_FIXTURES.updateWaiting),
    deps,
  );
  assertEquals(await res.json(), {
    ok: true,
    update: { release: "0.8.0" },
    event: null,
  });
  assertEquals(reported, [BOOTH]);
});

Deno.test("answers with no update when nothing waits for the booth", async () => {
  const { deps } = setup();
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), deps);
  assertEquals(await res.json(), { ok: true, update: null, event: null });
});

Deno.test("answers with the event the booth is at", async () => {
  const halloween = {
    id: "e1000000-0000-4000-8000-0000000000e1",
    name: "Halloween",
    startsAt: "2026-10-31T18:00:00+00:00",
    endsAt: "2026-11-01T02:00:00+00:00",
  };
  const { deps } = setup({ boothId: BOOTH }, null, halloween);
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), deps);
  assertEquals(await res.json(), { ok: true, update: null, event: halloween });
});

Deno.test("an event it can't read is none, and the heartbeat still counts", async () => {
  const { deps, evaluated } = setup();
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), {
    ...deps,
    currentEvent: () => Promise.reject(new Error("bad row")),
  });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, update: null, event: null });
  assertEquals(evaluated.length, 1);
});

Deno.test("accepts every fixture the protocol ships", async () => {
  for (const [name, fixture] of Object.entries(HEARTBEAT_FIXTURES)) {
    const { deps, evaluated } = setup();
    const res = await handleHeartbeat(post(fixture), deps);
    assertEquals(res.status, 200, name);
    assertEquals(evaluated.length, 1, name);
  }
});

Deno.test("the booth is the token's, whatever the body claims", async () => {
  const { deps, evaluated } = setup();
  await handleHeartbeat(
    post({ ...HEARTBEAT_FIXTURES.ready, boothId: "someone-else" }),
    deps,
  );
  assertEquals(evaluated[0]?.boothId, BOOTH);
});

Deno.test("refuses anything but POST", async () => {
  const { deps, evaluated } = setup();
  const res = await handleHeartbeat(
    new Request("https://hub.test/", { method: "GET" }),
    deps,
  );
  assertEquals(res.status, 405);
  assertEquals(evaluated.length, 0);
});

Deno.test("refuses a request with no bearer token", async () => {
  const { deps, evaluated } = setup();
  const req = new Request("https://hub.test/", {
    method: "POST",
    body: JSON.stringify(HEARTBEAT_FIXTURES.ready),
  });
  assertEquals((await handleHeartbeat(req, deps)).status, 401);
  assertEquals(evaluated.length, 0);
});

Deno.test("refuses a token Auth does not know", async () => {
  const { deps, evaluated } = setup("invalid-token");
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), deps);
  assertEquals(res.status, 401);
  assertEquals(evaluated.length, 0);
});

Deno.test("refuses a signed-in user who is not a booth", async () => {
  const { deps, evaluated } = setup("not-a-booth");
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), deps);
  assertEquals(res.status, 403);
  assertEquals(evaluated.length, 0);
});

Deno.test("refuses a body that is not JSON", async () => {
  const { deps } = setup();
  assertEquals((await handleHeartbeat(post("{nope"), deps)).status, 400);
});

Deno.test("refuses a heartbeat the schema refuses, naming the field", async () => {
  const { deps, evaluated } = setup();
  const res = await handleHeartbeat(
    post({
      ...HEARTBEAT_FIXTURES.ready,
      printer: { ...HEARTBEAT_FIXTURES.ready.printer, conditions: ["on-fire"] },
    }),
    deps,
  );
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.issues[0].path, "printer.conditions.0");
  assertEquals(evaluated.length, 0);
});

Deno.test("says so when the booth speaks a newer protocol", async () => {
  const { deps, evaluated } = setup();
  const res = await handleHeartbeat(
    post({ ...HEARTBEAT_FIXTURES.ready, protocol: 99 }),
    deps,
  );
  assertEquals(res.status, 422);
  assertEquals(evaluated.length, 0);
});

Deno.test("answers 404 for a booth the Hub does not have", async () => {
  const { deps } = setup();
  const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), {
    ...deps,
    evaluate: () => Promise.resolve("unknown-booth" as const),
  });
  assertEquals(res.status, 404);
});

Deno.test("answers 500 without leaking the error when storing fails", async () => {
  const { deps } = setup();
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleHeartbeat(post(HEARTBEAT_FIXTURES.ready), {
      ...deps,
      evaluate: () => Promise.reject(new Error("password=hunter2")),
    });
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "internal error" });
  } finally {
    console.error = original;
  }
});

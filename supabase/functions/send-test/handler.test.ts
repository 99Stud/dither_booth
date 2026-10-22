import type { PushMessage } from "@dither-booth/protocol/push";

import { assertEquals } from "@std/assert";

import type { Device } from "../_shared/push.ts";

import { handleSendTest, type SendTestDeps } from "./handler.ts";

const USER = "c0ffee00-0000-4000-8000-000000000001";
const PHONE: Device = {
  id: "phone",
  endpoint: "https://fcm.googleapis.com/fcm/send/1",
  p256dh: "k",
  auth: "a",
};

function setup(overrides: Partial<SendTestDeps> = {}) {
  const sent: PushMessage[] = [];
  const listedFor: string[] = [];
  const deps: SendTestDeps = {
    ready: true,
    authenticate: (token) => Promise.resolve(token === "good" ? USER : null),
    listDevices: (userId) => (listedFor.push(userId), Promise.resolve([PHONE])),
    send: (_d, payload) => (
      sent.push(JSON.parse(payload)),
      Promise.resolve({ status: 201 })
    ),
    forget: () => Promise.resolve(),
    markDelivered: () => Promise.resolve(),
    ...overrides,
  };
  return { deps, sent, listedFor };
}

const post = (token?: string) =>
  new Request("https://hub.test/functions/v1/send-test", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

Deno.test("pushes a test to the caller's own devices only", async () => {
  const { deps, sent, listedFor } = setup();
  const res = await handleSendTest(post("good"), deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sent, 1);
  assertEquals(listedFor, [USER]);
  assertEquals(sent[0]?.title, "Test notification");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("answers the browser's preflight", async () => {
  const { deps } = setup();
  const res = await handleSendTest(
    new Request("https://hub.test/", { method: "OPTIONS" }),
    deps,
  );
  assertEquals(res.status, 204);
  assertEquals(
    res.headers.get("Access-Control-Allow-Headers")?.includes("authorization"),
    true,
  );
});

Deno.test("refuses a caller who isn't signed in", async () => {
  const { deps, sent } = setup();
  assertEquals((await handleSendTest(post(), deps)).status, 401);
  assertEquals((await handleSendTest(post("bad"), deps)).status, 401);
  assertEquals(sent.length, 0);
});

Deno.test("without VAPID keys it says so", async () => {
  const { deps } = setup({ ready: false });
  const original = console.error;
  console.error = () => {};
  try {
    assertEquals((await handleSendTest(post("good"), deps)).status, 500);
  } finally {
    console.error = original;
  }
});

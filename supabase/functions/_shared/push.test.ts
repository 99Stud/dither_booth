import { assertEquals } from "@std/assert";

import {
  deliver,
  type Device,
  isGone,
  type PushAnswer,
  topicFor,
} from "./push.ts";

const device = (id: string, host = "fcm.googleapis.com"): Device => ({
  id,
  endpoint: `https://${host}/${id}`,
  p256dh: "k",
  auth: "a",
});
const OPTIONS = { urgency: "normal", ttlSeconds: 60, topic: "t" } as const;

function deps(answers: Record<string, PushAnswer | Error>) {
  const forgotten: string[] = [];
  const delivered: string[] = [];
  return {
    forgotten,
    delivered,
    deps: {
      send: (d: Device) => {
        const answer = answers[d.id] ?? { status: 201 };
        return answer instanceof Error
          ? Promise.reject(answer)
          : Promise.resolve(answer);
      },
      forget: (id: string) => (forgotten.push(id), Promise.resolve()),
      markDelivered: (id: string) => (delivered.push(id), Promise.resolve()),
    },
  };
}

Deno.test("a device the push service says is gone is forgotten, Apple's unreadable token included", () => {
  assertEquals(
    [404, 410].map((status) => isGone({ status })),
    [true, true],
  );
  assertEquals(isGone({ status: 400, reason: "BadWebPushToken" }), true);
  assertEquals(isGone({ status: 403, reason: "BadJwtToken" }), false);
  assertEquals(isGone({ status: 500 }), false);
});

Deno.test("delivers to every device, and says what each push service refused", async () => {
  const {
    deps: d,
    forgotten,
    delivered,
  } = deps({
    gone: { status: 410 },
    apple: { status: 400, reason: "BadWebPushToken" },
    jwt: { status: 403, reason: "BadJwtToken" },
    down: new Error("timeout"),
  });
  const original = console.warn;
  console.warn = () => {};
  try {
    const outcome = await deliver(
      [
        device("ok"),
        device("gone"),
        device("apple", "web.push.apple.com"),
        device("jwt", "web.push.apple.com"),
        device("down"),
      ],
      "{}",
      OPTIONS,
      d,
    );
    assertEquals(
      { ...outcome, refused: undefined },
      { sent: 1, removed: 2, failed: 2, refused: undefined },
    );
    assertEquals(outcome.refused["web.push.apple.com"]?.sort(), [
      "400 BadWebPushToken",
      "403 BadJwtToken",
    ]);
    assertEquals(outcome.refused["fcm.googleapis.com"]?.sort(), [
      "410",
      "timeout",
    ]);
    assertEquals(forgotten.sort(), ["apple", "gone"]);
    assertEquals(delivered, ["ok"]);
  } finally {
    console.warn = original;
  }
});

Deno.test("sends to all devices at once, not one after another", async () => {
  let inFlight = 0;
  let most = 0;
  const slow = {
    send: async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      return { status: 201 };
    },
    forget: () => Promise.resolve(),
    markDelivered: () => Promise.resolve(),
  };
  await deliver([device("a"), device("b"), device("c")], "{}", OPTIONS, slow);
  assertEquals(most, 3);
});

Deno.test("a push that arrived counts as sent, even if noting it fails", async () => {
  const { deps: d } = deps({});
  const original = console.error;
  console.error = () => {};
  try {
    const outcome = await deliver([device("ok")], "{}", OPTIONS, {
      ...d,
      markDelivered: () => Promise.reject(new Error("db down")),
    });
    assertEquals([outcome.sent, outcome.failed], [1, 0]);
  } finally {
    console.error = original;
  }
});

Deno.test("an endpoint that isn't a push service is never fetched, and is forgotten", async () => {
  const fetched: string[] = [];
  const { deps: d, forgotten } = deps({});
  const original = console.warn;
  console.warn = () => {};
  try {
    const outcome = await deliver(
      [
        {
          id: "internal",
          endpoint: "https://169.254.169.254/latest",
          p256dh: "k",
          auth: "a",
        },
        { id: "broken", endpoint: "not a url", p256dh: "k", auth: "a" },
        device("ok"),
      ],
      "{}",
      OPTIONS,
      {
        ...d,
        send: (dev: Device) => (fetched.push(dev.id), d.send(dev)),
      },
    );
    assertEquals(fetched, ["ok"]);
    assertEquals(forgotten.sort(), ["broken", "internal"]);
    assertEquals([outcome.sent, outcome.removed, outcome.failed], [1, 2, 0]);
    assertEquals(outcome.refused["not a push service"]?.length, 2);
  } finally {
    console.warn = original;
  }
});

Deno.test("a topic is the id without dashes, 32 characters at most", () => {
  assertEquals(
    topicFor("0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f"),
    "0f3e9c7a5b1d4c2e8a6f1d2c3b4a5e6f",
  );
});

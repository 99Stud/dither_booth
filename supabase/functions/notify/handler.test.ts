import { ALERT_KEYS } from "@dither-booth/protocol/alerts";
import { assertEquals } from "@std/assert";

import type { Device, PushOptions } from "../_shared/push.ts";

import { handleNotify, type NotifyDeps } from "./handler.ts";
import {
  type AlertToPush,
  composeMessage,
  type PushMessage,
} from "./messages.ts";

const ALERT_ID = "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f";
const NOW = new Date("2026-10-31T18:10:00.000Z");
const ALERT: AlertToPush = {
  id: ALERT_ID,
  orgId: "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f",
  key: "printer.paper-out",
  severity: "critical",
  boothName: "Booth A",
  openedAt: "2026-10-31T18:00:00.000Z",
  resolvedAt: null,
  acked: false,
};
const PHONE: Device = {
  id: "phone",
  endpoint: "https://push.test/1",
  p256dh: "k",
  auth: "a",
};

function setup(
  alert: AlertToPush | null = ALERT,
  overrides: Partial<NotifyDeps> = {},
) {
  const sent: { message: PushMessage; options: PushOptions }[] = [];
  const deps: NotifyDeps = {
    secret: "s3cret",
    ready: true,
    now: () => NOW,
    getAlert: () => Promise.resolve(alert),
    listDevices: () => Promise.resolve([PHONE]),
    send: (_device, payload, options) => {
      sent.push({ message: JSON.parse(payload), options });
      return Promise.resolve({ status: 201 });
    },
    forget: () => Promise.resolve(),
    markDelivered: () => Promise.resolve(),
    ...overrides,
  };
  return { deps, sent };
}

const event = (body: unknown, secret = "s3cret") =>
  new Request("https://hub.test/functions/v1/notify", {
    method: "POST",
    headers: { "x-notify-secret": secret },
    body: JSON.stringify(body),
  });

Deno.test("an opened critical alert pushes at high urgency, dated when it opened", async () => {
  const { deps, sent } = setup();
  const res = await handleNotify(
    event({ alertId: ALERT_ID, event: "opened" }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sent, 1);
  assertEquals(sent[0]?.options, {
    urgency: "high",
    ttlSeconds: 3600,
    topic: "0f3e9c7a5b1d4c2e8a6f1d2c3b4a5e6f",
  });
  assertEquals(sent[0]?.message.title, "Booth A: Out of paper");
  assertEquals(sent[0]?.message.at, ALERT.openedAt);
});

Deno.test("a warning opens at normal urgency", async () => {
  const { deps, sent } = setup({
    ...ALERT,
    key: "printer.paper-near-end",
    severity: "warn",
  });
  await handleNotify(event({ alertId: ALERT_ID, event: "opened" }), deps);
  assertEquals(sent[0]?.options.urgency, "normal");
});

Deno.test("back to normal is dated when it closed, so a late 'opened' can't replace it", async () => {
  const resolvedAt = "2026-10-31T18:05:00.000Z";
  const { deps, sent } = setup({ ...ALERT, resolvedAt });
  await handleNotify(event({ alertId: ALERT_ID, event: "resolved" }), deps);
  assertEquals(sent[0]?.message.title, "Booth A: back to normal");
  assertEquals(sent[0]?.message.body, "Out of paper: Paper is back in.");
  assertEquals(sent[0]?.message.at, resolvedAt);
  assertEquals(sent[0]?.options, {
    urgency: "normal",
    ttlSeconds: 600,
    topic: "0f3e9c7a5b1d4c2e8a6f1d2c3b4a5e6f",
  });
});

Deno.test("a reminder is dated now and reads as one sentence after another", async () => {
  const { deps, sent } = setup();
  await handleNotify(event({ alertId: ALERT_ID, event: "reminder" }), deps);
  assertEquals(
    sent[0]?.message.body,
    "Still to do. The booth can't print. Load a new roll.",
  );
  assertEquals(sent[0]?.message.at, NOW.toISOString());
});

Deno.test("a reminder or late open for an alert that moved on is dropped", async () => {
  for (const [alert, eventName, reason] of [
    [
      { ...ALERT, resolvedAt: "2026-10-31T18:05:00.000Z" },
      "reminder",
      "resolved",
    ],
    [
      { ...ALERT, resolvedAt: "2026-10-31T18:05:00.000Z" },
      "opened",
      "resolved",
    ],
    [{ ...ALERT, acked: true }, "reminder", "acknowledged"],
  ] as const) {
    const { deps, sent } = setup(alert);
    const res = await handleNotify(
      event({ alertId: ALERT_ID, event: eventName }),
      deps,
    );
    assertEquals(await res.json(), { skipped: reason });
    assertEquals(sent.length, 0);
  }
});

Deno.test("without VAPID keys it fails loudly instead of answering 200", async () => {
  const { deps, sent } = setup(ALERT, { ready: false });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleNotify(
      event({ alertId: ALERT_ID, event: "opened" }),
      deps,
    );
    assertEquals(res.status, 500);
    assertEquals(sent.length, 0);
  } finally {
    console.error = original;
  }
});

Deno.test("refuses a call without the shared secret, or when none is set", async () => {
  const { deps, sent } = setup();
  for (const secret of ["", "wrong", "s3cret-and-more"]) {
    assertEquals(
      (
        await handleNotify(
          event({ alertId: ALERT_ID, event: "opened" }, secret),
          deps,
        )
      ).status,
      401,
    );
  }
  assertEquals(
    (
      await handleNotify(event({ alertId: ALERT_ID, event: "opened" }, ""), {
        ...deps,
        secret: "",
      })
    ).status,
    401,
  );
  assertEquals(sent.length, 0);
});

Deno.test("refuses a malformed event, anything but POST, and an unknown alert", async () => {
  const { deps } = setup(null);
  assertEquals(
    (await handleNotify(event({ alertId: "nope", event: "opened" }), deps))
      .status,
    400,
  );
  assertEquals(
    (
      await handleNotify(
        new Request("https://hub.test/", { method: "GET" }),
        deps,
      )
    ).status,
    405,
  );
  assertEquals(
    (await handleNotify(event({ alertId: ALERT_ID, event: "opened" }), deps))
      .status,
    404,
  );
});

Deno.test("every alert gets its own words for every event", () => {
  for (const key of ALERT_KEYS) {
    for (const eventName of ["opened", "reminder", "resolved"] as const) {
      const message = composeMessage(
        { ...ALERT, key, resolvedAt: "2026-10-31T18:05:00.000Z" },
        eventName,
        NOW,
      );
      assertEquals(message.title.includes(key), false, `${key} ${eventName}`);
      assertEquals(
        message.body.includes("::") || message.body.endsWith(" "),
        false,
        `${key} ${eventName}`,
      );
    }
  }
});

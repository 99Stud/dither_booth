import { assertEquals } from "@std/assert";

import {
  handleNotify,
  type NotifyDeps,
  type PushSubscriptionRow,
} from "./handler.ts";
import {
  type AlertForPush,
  composeMessage,
  type PushMessage,
} from "./messages.ts";

const ALERT_ID = "0f3e9c7a-5b1d-4c2e-8a6f-1d2c3b4a5e6f";
const ALERT: AlertForPush & { orgId: string } = {
  id: ALERT_ID,
  key: "printer.paper-out",
  severity: "critical",
  boothName: "Booth A",
  resolved: false,
  acked: false,
  orgId: "8b1c2d3e-4f5a-4b6c-9d7e-0a1b2c3d4e5f",
};
const PHONE: PushSubscriptionRow = {
  id: "phone",
  endpoint: "https://push.test/1",
  p256dh: "k",
  auth: "a",
};
const IPAD: PushSubscriptionRow = {
  id: "ipad",
  endpoint: "https://push.test/2",
  p256dh: "k",
  auth: "a",
};

function setup(
  alert: (AlertForPush & { orgId: string }) | null = ALERT,
  statuses: Record<string, number> = {},
) {
  const sent: {
    to: string;
    message: PushMessage;
    urgency: string;
    ttl: number;
  }[] = [];
  const removed: string[] = [];
  const delivered: string[] = [];
  const deps: NotifyDeps = {
    secret: "s3cret",
    getAlert: () => Promise.resolve(alert),
    listSubscriptions: () => Promise.resolve([PHONE, IPAD]),
    send: (sub, message, options) => {
      sent.push({
        to: sub.id,
        message,
        urgency: options.urgency,
        ttl: options.ttlSeconds,
      });
      return Promise.resolve(statuses[sub.id] ?? 201);
    },
    removeSubscription: (id) => {
      removed.push(id);
      return Promise.resolve();
    },
    markDelivered: (id) => {
      delivered.push(id);
      return Promise.resolve();
    },
  };
  return { deps, sent, removed, delivered };
}

const event = (body: unknown, secret = "s3cret") =>
  new Request("https://hub.test/functions/v1/notify", {
    method: "POST",
    headers: { "x-notify-secret": secret },
    body: JSON.stringify(body),
  });

Deno.test("an opened alert goes to every device of the org, critical as high urgency", async () => {
  const { deps, sent, delivered } = setup();
  const res = await handleNotify(
    event({ alertId: ALERT_ID, event: "opened" }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { sent: 2, removed: 0, failed: 0 });
  assertEquals(
    sent.map((s) => [s.to, s.urgency, s.ttl]),
    [
      ["phone", "high", 3600],
      ["ipad", "high", 3600],
    ],
  );
  assertEquals(sent[0]?.message.title, "Booth A: Out of paper");
  assertEquals(sent[0]?.message.tag, ALERT_ID);
  assertEquals(delivered, ["phone", "ipad"]);
});

Deno.test("a device the push service says is gone is forgotten", async () => {
  const { deps, removed, delivered } = setup(ALERT, { phone: 410 });
  const res = await handleNotify(
    event({ alertId: ALERT_ID, event: "opened" }),
    deps,
  );
  assertEquals(await res.json(), { sent: 1, removed: 1, failed: 0 });
  assertEquals(removed, ["phone"]);
  assertEquals(delivered, ["ipad"]);
});

Deno.test("a push service that fails, or throws, is counted and the others still get it", async () => {
  const { deps } = setup(ALERT, { phone: 500 });
  const original = console.error;
  console.error = () => {};
  try {
    const res = await handleNotify(
      event({ alertId: ALERT_ID, event: "opened" }),
      {
        ...deps,
        send: (sub, ...rest) =>
          sub.id === "ipad"
            ? Promise.reject(new Error("timeout"))
            : deps.send(sub, ...rest),
      },
    );
    assertEquals(await res.json(), { sent: 0, removed: 0, failed: 2 });
  } finally {
    console.error = original;
  }
});

Deno.test("a resolved alert says back to normal, at normal urgency", async () => {
  const { deps, sent } = setup({ ...ALERT, resolved: true });
  await handleNotify(event({ alertId: ALERT_ID, event: "resolved" }), deps);
  assertEquals(sent[0]?.message.title, "Booth A: back to normal");
  assertEquals(sent[0]?.urgency, "normal");
});

Deno.test("a reminder for an alert that closed or was acknowledged is dropped", async () => {
  for (const [alert, reason] of [
    [{ ...ALERT, resolved: true }, "resolved"],
    [{ ...ALERT, acked: true }, "acknowledged"],
  ] as const) {
    const { deps, sent } = setup(alert);
    const res = await handleNotify(
      event({ alertId: ALERT_ID, event: "reminder" }),
      deps,
    );
    assertEquals(await res.json(), { skipped: reason });
    assertEquals(sent.length, 0);
  }
});

Deno.test("refuses a call without the shared secret", async () => {
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
  assertEquals(sent.length, 0);
});

Deno.test("refuses everything when the function has no secret set", async () => {
  const { deps } = setup();
  const res = await handleNotify(
    event({ alertId: ALERT_ID, event: "opened" }, ""),
    { ...deps, secret: "" },
  );
  assertEquals(res.status, 401);
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

Deno.test("every alert key has its own words", () => {
  for (const key of [
    "printer.paper-out",
    "printer.error",
    "printer.disconnected",
    "printer.paper-near-end",
    "printer.cover-open",
    "booth.silent",
  ]) {
    const message = composeMessage({ ...ALERT, key }, "opened");
    assertEquals(message.title.includes(key), false, key);
  }
  assertEquals(
    composeMessage(
      { ...ALERT, key: "booth.silent" },
      "reminder",
    ).body.startsWith("Still: "),
    true,
  );
});

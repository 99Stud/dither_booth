import type { PushMessage } from "@dither-booth/protocol/push";

import { describe, expect, test } from "bun:test";

import { notificationFor, parsePush } from "#sw/push-display";

const OPENED: PushMessage = {
  title: "Booth A: Out of paper",
  body: "The booth can't print. Load a new roll.",
  tag: "alert-1",
  url: "/alerts/alert-1",
  event: "opened",
  severity: "critical",
  at: "2026-10-31T18:00:00.000Z",
};
const RESOLVED: PushMessage = {
  ...OPENED,
  title: "Booth A: back to normal",
  body: "Out of paper: Paper is back in.",
  event: "resolved",
  at: "2026-10-31T18:05:00.000Z",
};
const shownFrom = (message: PushMessage) => ({
  title: message.title,
  body: message.body,
  data: {
    url: message.url,
    at: message.at,
    event: message.event,
    severity: message.severity,
  },
});

describe("notificationFor", () => {
  test("an open critical alert stays until handled, and makes noise", () => {
    const { title, options } = notificationFor(OPENED, []);
    expect(title).toBe("Booth A: Out of paper");
    expect(options).toMatchObject({
      tag: "alert-1",
      requireInteraction: true,
      silent: false,
      renotify: false,
    });
    expect(options.data).toEqual({
      url: "/alerts/alert-1",
      at: OPENED.at,
      event: "opened",
      severity: "critical",
    });
  });

  test("back to normal replaces the alert and doesn't insist", () => {
    const { title, options } = notificationFor(RESOLVED, [shownFrom(OPENED)]);
    expect(title).toBe("Booth A: back to normal");
    expect(options.requireInteraction).toBe(false);
  });

  test("a late 'opened' after 'back to normal' shows back to normal again, quietly", () => {
    const { title, options } = notificationFor(OPENED, [shownFrom(RESOLVED)]);
    expect(title).toBe("Booth A: back to normal");
    expect(options).toMatchObject({
      silent: true,
      requireInteraction: false,
      tag: "alert-1",
    });
  });

  test("a reminder sounds again", () => {
    const reminder = {
      ...OPENED,
      event: "reminder" as const,
      at: "2026-10-31T18:10:00.000Z",
    };
    expect(
      notificationFor(reminder, [shownFrom(OPENED)]).options.renotify,
    ).toBe(true);
  });

  test("a warning doesn't stay on screen", () => {
    expect(
      notificationFor({ ...OPENED, severity: "warn" }, []).options
        .requireInteraction,
    ).toBe(false);
  });
});

describe("parsePush", () => {
  test("reads the Hub's message", () => {
    expect(parsePush(JSON.stringify(OPENED))).toEqual(OPENED);
  });

  test("anything else still shows a notification", () => {
    for (const text of [undefined, "", "not json", "{}"]) {
      expect(parsePush(text).title).toBe("Dither Booth");
    }
  });
});

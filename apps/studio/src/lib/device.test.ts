import { describe, expect, test } from "bun:test";

import { deviceRow, deviceSupport, vapidKeyBytes } from "#lib/device";

const traits = {
  hasServiceWorker: true,
  hasPushManager: true,
  isAppleMobile: false,
  isStandalone: false,
};

describe("deviceSupport", () => {
  test("a desktop or Android browser with push is ready", () => {
    expect(deviceSupport(traits)).toBe("ready");
  });

  test("an iPhone in Safari must add Studio to the Home Screen first", () => {
    expect(
      deviceSupport({ ...traits, isAppleMobile: true, hasPushManager: false }),
    ).toBe("needs-home-screen");
  });

  test("the Home Screen app on an iPhone is ready", () => {
    expect(
      deviceSupport({ ...traits, isAppleMobile: true, isStandalone: true }),
    ).toBe("ready");
  });

  test("a browser without push can't", () => {
    expect(deviceSupport({ ...traits, hasPushManager: false })).toBe(
      "unsupported",
    );
  });
});

describe("vapidKeyBytes", () => {
  test("decodes the base64url public key to its 65 bytes", () => {
    const key = vapidKeyBytes(
      "BB8s2kM8vH13RlUZcgYNsnPFZjPdx0-nPzAQCd_xShyn-ltRRyFUuIWUNfl8zxrGZn2TbfPHi2JHF9EvP1UobHg",
    );
    expect(key.length).toBe(65);
    expect(key[0]).toBe(0x04);
  });
});

describe("deviceRow", () => {
  const owner = { orgId: "org", userId: "user" };
  const subscription = {
    endpoint: "https://web.push.apple.com/abc",
    keys: { p256dh: "BKey", auth: "secret" },
  };

  test("is the row the Hub stores", () => {
    expect(deviceRow(subscription, owner, "Safari")).toEqual({
      org_id: "org",
      user_id: "user",
      endpoint: "https://web.push.apple.com/abc",
      p256dh_key: "BKey",
      auth_secret: "secret",
      user_agent: "Safari",
    });
  });

  test("refuses an incomplete subscription, or one the Hub won't accept", () => {
    expect(() =>
      deviceRow({ endpoint: subscription.endpoint }, owner, "x"),
    ).toThrow("incomplete");
    expect(() =>
      deviceRow(
        { ...subscription, endpoint: "https://example.com/push" },
        owner,
        "x",
      ),
    ).toThrow("isn't one");
  });
});

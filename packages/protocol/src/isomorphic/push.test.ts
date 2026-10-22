import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isPushServiceEndpoint,
  PUSH_SERVICE_HOST_SUFFIX,
  PUSH_SERVICE_HOSTS,
} from "#isomorphic/push";

// Test-only: the Hub's migrations are the other half of this list, so the
// test reads them to keep the two from drifting.
const MIGRATIONS = join(import.meta.dir, "../../../../supabase/migrations");

describe("push service endpoints", () => {
  test.each([
    ["Apple", "https://web.push.apple.com/QGuQyavXutnMH"],
    ["Google", "https://fcm.googleapis.com/fcm/send/abc:def"],
    ["Mozilla", "https://updates.push.services.mozilla.com/wpush/v2/gAAAA"],
    ["Windows", "https://wns2-by3p.notify.windows.com/w/?token=abc"],
  ])("accepts %s's push service", (_, endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(true);
  });

  test.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["another host", "https://example.com/push"],
    ["an internal address", "https://169.254.169.254/latest"],
    ["a look-alike host", "https://fcm.googleapis.com.evil.test/x"],
    ["a suffix without its dot", "https://evilnotify.windows.com/x"],
    ["not a URL", "nope"],
  ])("refuses %s", (_, endpoint) => {
    expect(isPushServiceEndpoint(endpoint)).toBe(false);
  });

  test("the Hub's push_subscription check names the same services", () => {
    const sql = readdirSync(MIGRATIONS)
      .sort()
      .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
      .join("\n");
    const check =
      sql.match(
        /push_subscription_endpoint_push_service check \(([\s\S]*?)\n  \);/u,
      )?.[1] ?? "";
    const hosts = [...check.matchAll(/'([a-z0-9.%-]+)'/gu)].map(
      (match) => match[1],
    );
    expect(hosts.filter((host) => !host?.startsWith("%")).sort()).toEqual(
      [...PUSH_SERVICE_HOSTS].sort(),
    );
    expect(hosts).toContain(`%${PUSH_SERVICE_HOST_SUFFIX}`);
  });
});

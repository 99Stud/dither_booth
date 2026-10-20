import { describe, expect, test } from "bun:test";

import { buildCaptiveDnsmasqConf, buildCaptiveNftRules } from "./captive";

describe("captive page plumbing", () => {
  test("points Apple's and Android's checks at the booth Wi-Fi's address", () => {
    const conf = buildCaptiveDnsmasqConf();

    expect(conf).toContain("address=/captive.apple.com/10.42.0.1");
    expect(conf).toContain("address=/connectivitycheck.gstatic.com/10.42.0.1");
  });

  test("redirects port 80 on the booth Wi-Fi to the setup server, idempotently", () => {
    const rules = buildCaptiveNftRules(3003);

    expect(
      rules.startsWith("table ip ditherbooth\ndelete table ip ditherbooth\n"),
    ).toBe(true);
    expect(rules).toContain(
      "ip daddr 10.42.0.1 tcp dport 80 redirect to :3003",
    );
  });
});

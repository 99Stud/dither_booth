import { isReleaseVersion } from "@dither-booth/shared/booth-update";
import { parse } from "acorn";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPolkitRule } from "./network";
import {
  buildLogrotateRule,
  buildLogrotateTimerDropIn,
  buildNetworkDispatcher,
  buildRollbackUnit,
  buildSystemPolkitRule,
  buildUnit,
  buildUpdateUnit,
} from "./service";

describe("PM2 log rotation", () => {
  const rule = buildLogrotateRule("/mnt/ssd/dither-booth");
  const directives = rule
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  test("rotates the combined PM2 file of each process in the configured repo", () => {
    expect(directives.slice(0, 4)).toEqual([
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-engine.log",
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-admin.log",
      "/mnt/ssd/dither-booth/logs/pm2/dither-booth-shutter.log",
      "{",
    ]);
    expect(directives.at(-1)).toBe("}");
  });

  test("leaves the old -out.log and -err.log files alone", () => {
    expect(rule).not.toContain("*");
  });

  test("rotates daily or at 20 MB, keeps 7 compressed files, never closes PM2's handle", () => {
    expect(directives).toEqual(
      expect.arrayContaining([
        "daily",
        "maxsize 20M",
        "rotate 7",
        "compress",
        "copytruncate",
      ]),
    );
  });

  test("rotates as the service user, who owns the log folder", () => {
    expect(directives).toContain("su pi pi");
  });

  test("makes logrotate run hourly, so 20 MB is checked every hour", () => {
    const lines = buildLogrotateTimerDropIn()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    // An empty OnCalendar= clears Debian's daily schedule first.
    expect(lines).toEqual(["[Timer]", "OnCalendar=", "OnCalendar=hourly"]);
  });
});

describe("ditherbooth.service", () => {
  test("re-issues the certificate before starting, without blocking the start", () => {
    expect(buildUnit("/opt/dither-booth")).toContain(
      "ExecStartPre=-/usr/local/bin/booth cert --if-changed",
    );
  });
});

describe("network dispatcher", () => {
  test("reads the IP the certificate was issued for out of the manifest", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "dither-booth-dispatcher-"));
    const manifest = join(repoRoot, ".local/tls/booth-manifest.json");
    const script = buildNetworkDispatcher(repoRoot);
    const sedLine = script
      .split("\n")
      .find((line) => line.startsWith("recorded="));

    try {
      await Bun.write(
        manifest,
        JSON.stringify({ publicIp: "192.168.1.42", hostnames: [] }, null, 2),
      );
      const scriptPath = join(repoRoot, "read.sh");
      writeFileSync(scriptPath, `${sedLine}\necho "$recorded"\n`);
      const result = Bun.spawnSync(["sh", scriptPath]);

      expect(result.stdout.toString().trim()).toBe("192.168.1.42");
    } finally {
      rmSync(repoRoot, { force: true, recursive: true });
    }
  });
});

// polkit runs rules in Duktape, which is ES5 with a few later additions: a
// rule it can't compile is skipped whole, and logged only by polkitd. Bun
// runs newer syntax (a trailing comma in a call), so the tests that run a
// rule here can't catch it; parsing it as ES5 does.
describe("polkit rules", () => {
  test.each([
    ["network", buildPolkitRule],
    ["system", buildSystemPolkitRule],
  ])("the %s rule is ES5, which polkit can compile", (_, build) => {
    expect(() => parse(build(), { ecmaVersion: 5 })).not.toThrow();
  });
});

describe("network polkit rule", () => {
  test("lets the booth bring its own Wi-Fi up, not only change networks", () => {
    expect(buildPolkitRule()).toContain(
      "org.freedesktop.NetworkManager.wifi.share.protected",
    );
  });
});

describe("network dispatcher on the booth Wi-Fi", () => {
  test("restarts nothing: every certificate covers its address", () => {
    expect(buildNetworkDispatcher("/opt/dither-booth")).toContain(
      '[ "$current" = "10.42.0.1" ] && exit 0',
    );
  });
});

describe("system polkit rule", () => {
  type Action = { id: string; lookup: (key: string) => string | undefined };
  type Rule = (action: Action, subject: { user: string }) => string;

  // Runs the rule as polkit would: `addRule` hands over the function.
  const loadRule = (): Rule => {
    let rule: Rule | undefined;
    const polkit = {
      Result: { YES: "yes", NOT_HANDLED: "not-handled" },
      addRule: (fn: Rule) => {
        rule = fn;
      },
    };

    new Function("polkit", buildSystemPolkitRule())(polkit);

    if (!rule) throw new Error("the rule never called polkit.addRule");
    return rule;
  };

  const unitAction = (unit: string, verb: string): Action => ({
    id: "org.freedesktop.systemd1.manage-units",
    lookup: (key) => ({ unit, verb })[key],
  });
  const loginAction = (id: string): Action => ({ id, lookup: () => undefined });
  const pi = { user: "pi" };

  test("lets the service user restart the booth's unit, and nothing else", () => {
    const rule = loadRule();

    expect(rule(unitAction("ditherbooth.service", "restart"), pi)).toBe("yes");
    expect(rule(unitAction("ditherbooth.service", "stop"), pi)).toBe(
      "not-handled",
    );
    expect(rule(unitAction("ssh.service", "restart"), pi)).toBe("not-handled");
  });

  test("lets the service user reboot and power off, even with an SSH session open", () => {
    const rule = loadRule();

    for (const id of [
      "org.freedesktop.login1.reboot",
      "org.freedesktop.login1.reboot-multiple-sessions",
      "org.freedesktop.login1.power-off",
      "org.freedesktop.login1.power-off-multiple-sessions",
    ]) {
      expect(rule(loginAction(id), pi)).toBe("yes");
    }

    expect(
      rule(loginAction("org.freedesktop.login1.reboot-ignore-inhibit"), pi),
    ).toBe("not-handled");
  });

  test("lets the service user start an update to a release version, or a rollback", () => {
    const rule = loadRule();

    for (const unit of [
      "ditherbooth-update@0.8.0.service",
      "ditherbooth-update@0.8.0\\x2drc.1.service",
      "ditherbooth-rollback@keep\\x2ddb.service",
      "ditherbooth-rollback@restore\\x2ddb.service",
    ]) {
      expect(rule(unitAction(unit, "start"), pi)).toBe("yes");
      expect(rule(unitAction(unit, "stop"), pi)).toBe("not-handled");
    }

    for (const unit of [
      "ditherbooth-update@latest.service",
      "ditherbooth-update@0.8.0;reboot.service",
      "ditherbooth-rollback@anything.service",
    ]) {
      expect(rule(unitAction(unit, "start"), pi)).toBe("not-handled");
    }
  });

  test("starts an update for exactly the versions the booth accepts", () => {
    const rule = loadRule();

    for (const version of [
      "0.8.0",
      "10.2.33",
      "0.8.0-rc.1",
      "0.8.0-rc-1",
      "0.8.0+build",
      "v0.8.0",
      "0.8",
      "0.8.0;reboot",
    ]) {
      const unit = `ditherbooth-update@${version.replaceAll("-", "\\x2d")}.service`;
      expect(rule(unitAction(unit, "start"), pi) === "yes").toBe(
        isReleaseVersion(version),
      );
    }
  });

  test("grants nothing to another user", () => {
    const rule = loadRule();

    expect(
      rule(loginAction("org.freedesktop.login1.reboot"), { user: "guest" }),
    ).toBe("not-handled");
    expect(
      rule(unitAction("ditherbooth.service", "restart"), { user: "guest" }),
    ).toBe("not-handled");
  });
});

describe("update and rollback units", () => {
  test("run the CLI as root on the unit's unescaped instance", () => {
    expect(buildUpdateUnit()).toContain(
      "ExecStart=/usr/local/bin/booth update %I --no-banner --color=never",
    );
    expect(buildUpdateUnit()).toContain("Type=oneshot");
    expect(buildUpdateUnit()).not.toContain("User=");
    expect(buildRollbackUnit()).toContain(
      "ExecStart=/usr/local/bin/booth rollback --mode %I --no-banner --color=never",
    );
  });

  test("end an interrupted job, however the process ended, and at every booth start", () => {
    expect(buildUpdateUnit()).toContain(
      "ExecStopPost=/usr/local/bin/booth update --recover --no-banner --color=never",
    );
    // Going back takes a stop, a start and a 2 min check: past the 90 s default.
    expect(buildUpdateUnit()).toContain("TimeoutStopSec=5min");
    // Going back takes a stop, a start and a 2 min check: past the 90 s default.
    expect(buildUpdateUnit()).toContain("TimeoutStopSec=5min");
    // `+`: as root, though the booth's unit runs as pi; `-`: never blocks its start.
    expect(buildUnit("/opt/dither-booth")).toContain(
      "ExecStartPre=-+/usr/local/bin/booth update --recover --no-restart --no-banner --color=never",
    );
  });
});

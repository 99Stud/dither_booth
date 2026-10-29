import { describe, expect, test } from "bun:test";

import {
  journalGroupCheck,
  logRotationCheck,
  powerControlsCheck,
} from "./doctor";
import {
  buildLogrotateRule,
  buildLogrotateTimerDropIn,
  buildSystemPolkitRule,
} from "./service";

describe("doctor: log rotation", () => {
  const installed = {
    rule: buildLogrotateRule("/opt/dither-booth"),
    timerDropIn: buildLogrotateTimerDropIn(),
  };

  test("passes when the rule and the hourly timer are the ones this CLI writes", () => {
    const check = logRotationCheck(installed, "/opt/dither-booth");

    expect(check.status).toBe("pass");
    expect(check.label).toBe(
      "PM2 logs rotated daily, or past 20 MB (checked hourly)",
    );
  });

  test("fails when no rule is installed: the logs would fill the disk", () => {
    const check = logRotationCheck(
      { ...installed, rule: undefined },
      "/opt/dither-booth",
    );

    expect(check.status).toBe("fail");
    expect(check.detail).toContain("sudo booth service");
  });

  test("warns when the rule rotates another folder or is out of date", () => {
    expect(logRotationCheck(installed, "/mnt/ssd/dither-booth").status).toBe(
      "warn",
    );
  });

  test("warns when logrotate still runs once a day: 20 MB is no cap", () => {
    for (const timerDropIn of [undefined, "[Timer]\nOnCalendar=weekly\n"]) {
      const check = logRotationCheck(
        { ...installed, timerDropIn },
        "/opt/dither-booth",
      );

      expect(check.status).toBe("warn");
      expect(check.label).toContain("/etc/systemd/system/logrotate.timer.d/");
      expect(check.detail).toContain("sudo booth service");
    }
  });
});

describe("doctor: journal access", () => {
  test("passes when the service user is in systemd-journal", () => {
    expect(journalGroupCheck("pi adm dialout systemd-journal").status).toBe(
      "pass",
    );
  });

  test("warns otherwise: only system lines are missing from the Logs page", () => {
    const check = journalGroupCheck("pi adm dialout systemd-journald");

    expect(check.status).toBe("warn");
    expect(check.detail).toContain("sudo booth service");
  });

  test("warns when the user's groups can't be read", () => {
    expect(journalGroupCheck(undefined).status).toBe("warn");
  });
});

describe("doctor: power controls", () => {
  test("passes when the rule is the one this CLI writes", () => {
    expect(powerControlsCheck(buildSystemPolkitRule(), true)?.status).toBe(
      "pass",
    );
  });

  test("warns when the rule is missing or out of date", () => {
    for (const installed of [undefined, "// an older rule\n"]) {
      const check = powerControlsCheck(installed, true);

      expect(check?.status).toBe("warn");
      expect(check?.detail).toContain("sudo booth service");
    }
  });

  test("says nothing without sudo: the rules folder is root-only", () => {
    expect(powerControlsCheck(undefined, false)).toBeUndefined();
  });
});

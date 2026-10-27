import { describe, expect, test } from "bun:test";

import { journalGroupCheck, logRotationCheck } from "./doctor";
import { buildLogrotateRule } from "./service";

describe("doctor: log rotation", () => {
  test("passes when the installed rule is the one this CLI writes", () => {
    const installed = buildLogrotateRule("/opt/dither-booth");

    expect(logRotationCheck(installed, "/opt/dither-booth").status).toBe(
      "pass",
    );
  });

  test("fails when no rule is installed: the logs would fill the disk", () => {
    const check = logRotationCheck(undefined, "/opt/dither-booth");

    expect(check.status).toBe("fail");
    expect(check.detail).toContain("sudo booth service");
  });

  test("warns when the rule rotates another folder or is out of date", () => {
    const installed = buildLogrotateRule("/opt/dither-booth");

    expect(logRotationCheck(installed, "/mnt/ssd/dither-booth").status).toBe(
      "warn",
    );
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

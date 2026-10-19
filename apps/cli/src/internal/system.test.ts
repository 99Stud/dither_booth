import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { SERVICE_BUN, SERVICE_HOME, SERVICE_USER } from "#internal/config";

import { asServiceUser, serviceBun } from "./system";

describe("asServiceUser", () => {
  afterEach(() => {
    spyOn(process, "getuid").mockRestore();
  });

  test("as root, runs the command as the service user from its home", () => {
    spyOn(process, "getuid").mockReturnValue(0);

    const command = asServiceUser(["git", "pull"]);

    expect(command.slice(0, 4)).toEqual(["runuser", "-u", SERVICE_USER, "--"]);
    expect(command).toContain(`HOME=${SERVICE_HOME}`);
    expect(command.slice(-2)).toEqual(["git", "pull"]);
  });

  test("as the user, runs the command directly", () => {
    spyOn(process, "getuid").mockReturnValue(1000);

    const command = asServiceUser(["git", "pull"]);

    expect(command).not.toContain("runuser");
    expect(command.slice(-2)).toEqual(["git", "pull"]);
  });

  test("puts the service user's Bun first on PATH", () => {
    spyOn(process, "getuid").mockReturnValue(0);

    const path = asServiceUser(["bun"]).find((part) =>
      part.startsWith("PATH="),
    );

    expect(path?.startsWith(`PATH=${SERVICE_HOME}/.bun/bin:`)).toBe(true);
  });
});

describe("serviceBun", () => {
  test("calls Bun by its absolute path, not through PATH", () => {
    spyOn(process, "getuid").mockReturnValue(0);

    expect(serviceBun(["install"]).slice(-2)).toEqual([SERVICE_BUN, "install"]);

    spyOn(process, "getuid").mockRestore();
  });
});

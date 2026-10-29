import { describe, expect, it } from "bun:test";

import type { PowerRun } from "./power.server";

import { getPowerCommand, runPowerAction } from "./power.server";

const NOW = () => new Date("2026-10-29T10:00:00.000Z");

const fakeRun = (outcome: Awaited<ReturnType<PowerRun>>) => {
  const calls: string[][] = [];
  const run: PowerRun = async (args) => {
    calls.push(args);
    return outcome;
  };

  return { calls, run };
};

describe("getPowerCommand", () => {
  it("never waits for the job: systemd stops this server as part of it", () => {
    expect(getPowerCommand("restart-apps")).toEqual([
      "systemctl",
      "--no-block",
      "restart",
      "ditherbooth.service",
    ]);
    expect(getPowerCommand("reboot")).toEqual([
      "systemctl",
      "--no-block",
      "reboot",
    ]);
    expect(getPowerCommand("power-off")).toEqual([
      "systemctl",
      "--no-block",
      "poweroff",
    ]);
  });
});

describe("runPowerAction", () => {
  it("accepts the action once systemctl queued it", async () => {
    const { calls, run } = fakeRun({ exitCode: 0, stderr: "" });

    expect(await runPowerAction("reboot", run, NOW)).toEqual({
      ok: true,
      action: "reboot",
      acceptedAt: "2026-10-29T10:00:00.000Z",
    });
    expect(calls).toEqual([["systemctl", "--no-block", "reboot"]]);
  });

  it("says how to fix it when polkit refused", async () => {
    for (const stderr of [
      "Failed to restart ditherbooth.service: Access denied\n",
      "Failed to reboot system via logind: Interactive authentication required.\n",
    ]) {
      const result = await runPowerAction(
        "restart-apps",
        fakeRun({ exitCode: 1, stderr }).run,
        NOW,
      );

      expect(result).toMatchObject({ ok: false, code: "not-permitted" });
      expect(!result.ok && result.message).toContain("sudo booth service");
    }
  });

  it("passes on any other failure, including no systemctl at all", async () => {
    expect(
      await runPowerAction(
        "power-off",
        fakeRun({ exitCode: 1, stderr: "Operation inhibited\n" }).run,
        NOW,
      ),
    ).toEqual({ ok: false, code: "failed", message: "Operation inhibited" });

    const missing: PowerRun = async () => {
      throw new Error('Executable not found in $PATH: "systemctl"');
    };

    expect(await runPowerAction("reboot", missing, NOW)).toMatchObject({
      ok: false,
      code: "failed",
      message: expect.stringContaining("systemctl"),
    });
  });
});

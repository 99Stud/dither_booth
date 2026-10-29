import { describe, expect, it } from "bun:test";

import type { PowerPhase, WaitingPowerPhase } from "./power.utils";

import { POWER_BACK_TIMEOUT_MS, POWER_OFF_SILENCE_MS } from "./power.constants";
import { advancePowerPhase, startWaiting } from "./power.utils";

/** Feeds probes in order, each `[answered, at]`, from an accepted action. */
const probe = (
  phase: WaitingPowerPhase,
  probes: Array<[boolean, number]>,
): PowerPhase =>
  probes.reduce<PowerPhase>(
    (current, [answered, at]) =>
      current.kind === "waiting"
        ? advancePowerPhase(current, { answered, at })
        : current,
    phase,
  );

describe("advancePowerPhase", () => {
  it("is back once the admin went down and answers again", () => {
    const phase = startWaiting("restart-apps", 0);

    expect(probe(phase, [[true, 2_000]]).kind).toBe("waiting");
    expect(
      probe(phase, [
        [true, 2_000],
        [false, 4_000],
        [true, 6_000],
      ]),
    ).toEqual({ kind: "back", action: "restart-apps" });
  });

  it("is off once the admin has been silent long enough, not before", () => {
    const phase = startWaiting("power-off", 0);

    expect(
      probe(phase, [
        [false, 2_000],
        [false, 2_000 + POWER_OFF_SILENCE_MS - 1],
      ]).kind,
    ).toBe("waiting");
    expect(
      probe(phase, [
        [false, 2_000],
        [false, 2_000 + POWER_OFF_SILENCE_MS],
      ]),
    ).toEqual({ kind: "off" });
  });

  it("starts the silence over when the admin answers in between", () => {
    const phase = startWaiting("power-off", 0);

    expect(
      probe(phase, [
        [false, 2_000],
        [true, 8_000],
        [false, 10_000],
        [false, 2_000 + POWER_OFF_SILENCE_MS],
      ]).kind,
    ).toBe("waiting");
  });

  it("gives up after the timeout, whatever the action", () => {
    expect(
      probe(startWaiting("reboot", 0), [[false, POWER_BACK_TIMEOUT_MS]]),
    ).toEqual({ kind: "lost", action: "reboot" });
    expect(
      probe(startWaiting("power-off", 0), [[true, POWER_BACK_TIMEOUT_MS]]),
    ).toEqual({ kind: "lost", action: "power-off" });
  });
});

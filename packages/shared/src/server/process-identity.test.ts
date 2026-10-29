import { describe, expect, test } from "bun:test";

import { currentProcessIdentity, isProcessAlive } from "./process-identity";

const onLinux = process.platform === "linux";

describe("process identity", () => {
  test.if(onLinux)("names this process, and finds it alive", () => {
    const identity = currentProcessIdentity();

    expect(identity).toMatchObject({ pid: process.pid });
    expect(isProcessAlive(identity!)).toBe(true);
  });

  test.if(onLinux)(
    "a pid reused by another process, or another boot, is dead",
    () => {
      const identity = currentProcessIdentity()!;

      expect(
        isProcessAlive({
          ...identity,
          startedTicks: identity.startedTicks + 1,
        }),
      ).toBe(false);
      expect(isProcessAlive({ ...identity, bootId: "another-boot" })).toBe(
        false,
      );
      expect(isProcessAlive({ ...identity, pid: 2_147_483_000 })).toBe(false);
    },
  );

  test.if(!onLinux)("is unknown off Linux", () => {
    expect(currentProcessIdentity()).toBeNull();
    expect(
      isProcessAlive({ pid: process.pid, bootId: "x", startedTicks: 0 }),
    ).toBe(false);
  });
});

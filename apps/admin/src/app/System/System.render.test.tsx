import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  installFakeSystemFetch,
  installReducedMotion,
} from "#lib/system/system.render-testing";
import { createSnapshotFixture } from "#lib/system/system.testing";
import { renderWithProviders, screen, within } from "#lib/test/render";

import { System } from "./index";

let restoreMotion: () => void;
let fetchStub: ReturnType<typeof installFakeSystemFetch> | undefined;

beforeEach(() => {
  restoreMotion = installReducedMotion();
});

afterEach(() => {
  fetchStub?.restore();
  restoreMotion();
});

const renderSystem = () =>
  renderWithProviders(<System />, { route: { path: "/system" } });

describe("System page", () => {
  test("shows the Pi's readings and what they mean", async () => {
    fetchStub = installFakeSystemFetch(createSnapshotFixture());
    renderSystem();

    expect(await screen.findByText("61.2")).toBeDefined();
    expect(fetchStub.calls[0]).toBe("/admin/system");

    const statuses = screen.getAllByRole("status");
    const words = statuses.map((status) => status.textContent);

    expect(words).toContain("Live");
    expect(words).toContain("Cool");
    expect(words).toContain("Flagged since boot");
    expect(words).toContain("Plenty free");
    expect(words).toContain("Keeping up");
    expect(words).toContain("Room to spare");

    const flags = screen.getByRole("table", { name: "Throttle flags" });
    const underVoltage = within(flags)
      .getByText("Under-voltage")
      .closest("tr")!;

    expect(within(underVoltage).getAllByText("No")).toHaveLength(1);
    expect(within(underVoltage).getByText("Yes")).toBeDefined();
    expect(screen.getByText("2954 rpm")).toBeDefined();
    expect(screen.getByText("2.44 GB")).toBeDefined();
    expect(screen.getByText("Raspberry Pi 5 Model B Rev 1.0")).toBeDefined();
  });

  test("off the booth, says which readings only the Pi has", async () => {
    fetchStub = installFakeSystemFetch(
      createSnapshotFixture({
        hardware: { model: null, bootedAt: new Date().toISOString() },
        thermal: { celsius: null, fanRpm: null, cpuMhz: null, throttle: null },
        sources: {
          thermal: {
            state: "unavailable",
            message: "No thermal zone on this machine: read on the booth.",
          },
          fan: { state: "unavailable", message: "No fan sensor." },
          throttle: {
            state: "unavailable",
            message:
              "No vcgencmd on this machine: throttling is read on the booth.",
          },
          cpuFrequency: { state: "unavailable", message: "No CPU clock." },
        },
        memory: {
          totalBytes: 32 * 1024 ** 3,
          availableBytes: null,
          cachedBytes: 0,
          swapTotalBytes: 0,
          swapUsedBytes: 0,
        },
        history: {
          t: [1],
          celsius: [null],
          availablePercent: [null],
          cpuPercent: [null],
        },
      }),
    );
    renderSystem();

    expect(
      await screen.findByText(
        "No thermal zone on this machine: read on the booth.",
      ),
    ).toBeDefined();
    expect(screen.getAllByText("Not on a Pi")).toHaveLength(3);
    expect(screen.getByText("Not a Raspberry Pi")).toBeDefined();
    expect(screen.queryByRole("table", { name: "Throttle flags" })).toBeNull();
    expect(screen.getByRole("table", { name: "Disks" })).toBeDefined();
  });

  test("offers a retry when the admin server doesn't answer", async () => {
    fetchStub = installFakeSystemFetch(undefined);
    renderSystem();

    expect(await screen.findByText("Can't read the Pi")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });
});

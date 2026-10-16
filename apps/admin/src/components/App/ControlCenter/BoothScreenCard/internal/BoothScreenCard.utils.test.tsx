import { describe, expect, it } from "bun:test";

import { getMaintenanceStatus } from "./BoothScreenCard.utils";

describe("getMaintenanceStatus", () => {
  it("says nothing while maintenance is off", () => {
    expect(
      getMaintenanceStatus({
        enabled: false,
        isShown: false,
        screen: "shutter",
      }),
    ).toBeNull();
  });

  it("waits for the guest until the screen shows it", () => {
    expect(
      getMaintenanceStatus({
        enabled: true,
        isShown: false,
        screen: "shutter",
      }),
    ).toBe("Maintenance starts when the current guest is done…");
    expect(
      getMaintenanceStatus({ enabled: true, isShown: true, screen: "shutter" }),
    ).toBe("Guests see the maintenance screen.");
  });

  it("explains a Darkroom or an offline screen", () => {
    expect(
      getMaintenanceStatus({
        enabled: true,
        isShown: false,
        screen: "darkroom",
      }),
    ).toBe("Guests will see the maintenance screen when the Darkroom closes.");
    expect(
      getMaintenanceStatus({
        enabled: true,
        isShown: false,
        screen: undefined,
      }),
    ).toBe("The booth screen will show maintenance when it's back online.");
  });
});

import type { KioskScreen } from "@dither-booth/shared/kiosk";

/**
 * The line under the maintenance switch, or null when there is nothing to
 * add. `screen` is the booth screen's mode, undefined while it is offline;
 * `isShown` is whether it shows the maintenance screen right now.
 */
export const getMaintenanceStatus = ({
  enabled,
  isShown,
  screen,
}: {
  enabled: boolean;
  isShown: boolean;
  screen: KioskScreen | undefined;
}): string | null => {
  if (!enabled) return null;
  if (screen === undefined) {
    return "The booth screen will show maintenance when it's back online.";
  }
  if (isShown) return "Guests see the maintenance screen.";
  if (screen === "darkroom") {
    return "Guests will see the maintenance screen when the Darkroom closes.";
  }
  return "Maintenance starts when the current guest is done…";
};

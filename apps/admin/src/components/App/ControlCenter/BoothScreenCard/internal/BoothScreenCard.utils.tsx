import type { KioskScreen } from "@dither-booth/shared/kiosk";

/**
 * The line under the maintenance switch, or null when there is nothing to
 * add. `enabled` is whether the booth is in maintenance, for any reason;
 * `manual` whether staff switched it on; `printerTrouble` why the printer
 * keeps it on, when it does. `screen` is the booth screen's mode, undefined
 * while it is offline; `isShown` is whether it shows the maintenance screen
 * right now.
 */
export const getMaintenanceStatus = ({
  enabled,
  isShown,
  manual = enabled,
  printerTrouble,
  screen,
}: {
  enabled: boolean;
  isShown: boolean;
  manual?: boolean;
  printerTrouble?: string;
  screen: KioskScreen | undefined;
}): string | null => {
  if (!enabled) return null;
  if (!manual && printerTrouble) {
    return `In maintenance because ${printerTrouble}. It ends on its own once the printer is ready.`;
  }

  const status = getScreenStatus({ isShown, screen });
  return printerTrouble ? `${status} Also, ${printerTrouble}.` : status;
};

const getScreenStatus = ({
  isShown,
  screen,
}: {
  isShown: boolean;
  screen: KioskScreen | undefined;
}) => {
  if (screen === undefined) {
    return "The booth screen will show maintenance when it's back online.";
  }
  if (isShown) return "Guests see the maintenance screen.";
  if (screen === "darkroom") {
    return "Guests will see the maintenance screen when the Darkroom closes.";
  }
  return "Maintenance starts when the current guest is done…";
};

import { reloadKiosk } from "./mutations/reload-kiosk";
import { reportKioskStatus } from "./mutations/report-kiosk-status";
import { showKioskScreen } from "./mutations/show-kiosk-screen";
import { onKioskCommand } from "./subscriptions/on-kiosk-command";

export const kiosk = {
  onKioskCommand,
  reloadKiosk,
  reportKioskStatus,
  showKioskScreen,
};

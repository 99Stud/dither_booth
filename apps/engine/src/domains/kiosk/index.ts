import { reloadKiosk } from "./mutations/reload-kiosk";
import { showKioskScreen } from "./mutations/show-kiosk-screen";
import { onKioskCommand } from "./subscriptions/on-kiosk-command";

export const kiosk = {
  onKioskCommand,
  reloadKiosk,
  showKioskScreen,
};

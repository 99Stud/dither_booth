import { reloadKiosk } from "./mutations/reload-kiosk";
import { onKioskCommand } from "./subscriptions/on-kiosk-command";

export const kiosk = {
  onKioskCommand,
  reloadKiosk,
};

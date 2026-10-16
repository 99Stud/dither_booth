import { reloadKiosk } from "./mutations/reload-kiosk";
import { reportKioskStatus } from "./mutations/report-kiosk-status";
import { sendCameraSignal } from "./mutations/send-camera-signal";
import { sendKioskCameraSignal } from "./mutations/send-kiosk-camera-signal";
import { setKioskMaintenance } from "./mutations/set-kiosk-maintenance";
import { showKioskScreen } from "./mutations/show-kiosk-screen";
import { onKioskCommand } from "./subscriptions/on-kiosk-command";
import { watchCamera } from "./subscriptions/watch-camera";

export const kiosk = {
  onKioskCommand,
  reloadKiosk,
  reportKioskStatus,
  sendCameraSignal,
  sendKioskCameraSignal,
  setKioskMaintenance,
  showKioskScreen,
  watchCamera,
};

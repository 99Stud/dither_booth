import { forgetWifiNetwork } from "./mutations/forget-wifi-network";
import { saveWifiNetwork } from "./mutations/save-wifi-network";
import { setBoothWifi } from "./mutations/set-booth-wifi";
import { getNetworkStatus } from "./queries/get-network-status";

export const network = {
  forgetWifiNetwork,
  getNetworkStatus,
  saveWifiNetwork,
  setBoothWifi,
};

import { getCaptiveStatus } from "./captive/get-captive-status";
import { joinFromCaptive } from "./captive/join-from-captive";
import { runOnBoothWifi } from "./captive/run-on-booth-wifi";
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

/** The booth Wi-Fi's captive page, through the setup server only. */
export const captive = {
  getCaptiveStatus,
  joinFromCaptive,
  runOnBoothWifi,
};

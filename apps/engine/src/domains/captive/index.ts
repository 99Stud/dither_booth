import { joinFromCaptive } from "./mutations/join-from-captive";
import { getCaptiveStatus } from "./queries/get-captive-status";

/** The booth Wi-Fi's captive page, through the setup server only. */
export const captive = {
  getCaptiveStatus,
  joinFromCaptive,
};

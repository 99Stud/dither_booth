import { printSetupTicket } from "./mutations/print-setup-ticket";
import { getDeviceSetup } from "./queries/get-device-setup";

export const deviceSetup = {
  getDeviceSetup,
  printSetupTicket,
};

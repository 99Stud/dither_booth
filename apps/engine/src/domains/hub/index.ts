import { forgetHubRegistration } from "./mutations/forget-hub-registration";
import { registerWithHub } from "./mutations/register-with-hub";
import { getHubRegistration } from "./queries/get-hub-registration";

export const hub = {
  forgetHubRegistration,
  getHubRegistration,
  registerWithHub,
};

import { linkToHub } from "./mutations/link-to-hub";
import { unlinkFromHub } from "./mutations/unlink-from-hub";
import { getHubLink } from "./queries/get-hub-link";

export const hub = {
  getHubLink,
  linkToHub,
  unlinkFromHub,
};

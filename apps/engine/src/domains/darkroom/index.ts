import { lockDarkroom } from "./mutations/lock-darkroom";
import { setDarkroomPin } from "./mutations/set-darkroom-pin";
import { unlockDarkroom } from "./mutations/unlock-darkroom";
import { getDarkroomPinStatus } from "./queries/get-darkroom-pin-status";

export const darkroom = {
  getDarkroomPinStatus,
  lockDarkroom,
  setDarkroomPin,
  unlockDarkroom,
};

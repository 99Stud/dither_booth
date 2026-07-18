import { createEvent } from "./mutations/create-event";
import { createLot } from "./mutations/create-lot";
import { deleteLot } from "./mutations/delete-lot";
import { replaceEvent } from "./mutations/replace-event";
import { restockLot } from "./mutations/restock-lot";
import { updateEvent } from "./mutations/update-event";
import { updateLot } from "./mutations/update-lot";
import { updateLotterySettings } from "./mutations/update-lottery-settings";
import { getCurrentEvent } from "./queries/get-current-event";

export const event = {
  getCurrentEvent,
  createEvent,
  updateEvent,
  replaceEvent,
  updateLotterySettings,
  createLot,
  updateLot,
  deleteLot,
  restockLot,
};

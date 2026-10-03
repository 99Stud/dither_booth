import { createEvent } from "./mutations/create-event";
import { createPrize } from "./mutations/create-prize";
import { deletePrize } from "./mutations/delete-prize";
import { replaceEvent } from "./mutations/replace-event";
import { restockPrize } from "./mutations/restock-prize";
import { updateEvent } from "./mutations/update-event";
import { updateLotterySettings } from "./mutations/update-lottery-settings";
import { updatePrize } from "./mutations/update-prize";
import { updateTicketItems } from "./mutations/update-ticket-items";
import { getCurrentEvent } from "./queries/get-current-event";
import { listDraws } from "./queries/list-draws";

export const event = {
  getCurrentEvent,
  listDraws,
  createEvent,
  updateEvent,
  updateTicketItems,
  replaceEvent,
  updateLotterySettings,
  createPrize,
  updatePrize,
  deletePrize,
  restockPrize,
};

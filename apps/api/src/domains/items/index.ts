import { createItem } from "./mutations/create-item";
import { deleteItem } from "./mutations/delete-item";
import { resetAllItemQuantities } from "./mutations/reset-all-item-quantities";
import { updateItem } from "./mutations/update-item";
import { getItems } from "./queries/get-items";

export const items = {
  getItems,
  createItem,
  updateItem,
  deleteItem,
  resetAllItemQuantities,
};

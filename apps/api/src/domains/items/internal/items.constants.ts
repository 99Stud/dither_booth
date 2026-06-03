import { z } from "zod";

export const CREATE_ITEM_SCHEMA = z.object({
  label: z.string().min(1).max(200),
  qty: z.number().int().min(1),
  price: z.number().min(0),
});

export const UPDATE_ITEM_SCHEMA = z.object({
  id: z.number().int(),
  label: z.string().min(1).max(200).optional(),
  qty: z.number().int().min(0).optional(),
  price: z.number().min(0).optional(),
});

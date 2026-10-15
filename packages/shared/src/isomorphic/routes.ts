import z from "zod";

import { KIT_IDS } from "#isomorphic/kits";
import { drawOutcomeSchema, raritySchema } from "#isomorphic/lottery";
import {
  boothTicketRefSchema,
  ticketItemNamesSchema,
} from "#isomorphic/ticket";

export const RECEIPT_VIEWER_PATH = "/receipt-viewer";

/** A photo receipt renders the event's kit, so its templates are the kits. */
export const PHOTO_RECEIPT_TEMPLATES = KIT_IDS;
export const LOTTERY_RECEIPT_TEMPLATE = "lottery" as const;
export const RECEIPT_TEMPLATES = [
  ...PHOTO_RECEIPT_TEMPLATES,
  LOTTERY_RECEIPT_TEMPLATE,
] as const;

export const RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM = "template";

export const photoReceiptTemplateSchema = z.enum(PHOTO_RECEIPT_TEMPLATES);
export const receiptTemplateSchema = z.enum(RECEIPT_TEMPLATES);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  [RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM]: receiptTemplateSchema.optional(),
  outcome: drawOutcomeSchema.optional(),
  prizeId: z.string().optional(),
  title: z.string().optional(),
  winInstruction: z.string().optional(),
  prizeRarity: raritySchema.optional(),
  wonAt: z.string().optional(),
  ticketRef: boothTicketRefSchema.optional(),
  ticketItems: ticketItemNamesSchema.optional(),
});

export type PhotoReceiptTemplate = z.infer<typeof photoReceiptTemplateSchema>;
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;
export type ReceiptViewerSearch = z.infer<typeof RECEIPT_VIEWER_SEARCH_SCHEMA>;

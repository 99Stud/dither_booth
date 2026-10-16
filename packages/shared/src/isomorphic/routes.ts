import z from "zod";

import { kitIdSchema } from "#isomorphic/kits";
import { drawOutcomeSchema, raritySchema } from "#isomorphic/lottery";
import {
  boothTicketRefSchema,
  ticketItemNamesSchema,
} from "#isomorphic/ticket";

export const RECEIPT_VIEWER_PATH = "/receipt-viewer";

/**
 * Which ticket to render. The kit (`kit` search param) decides how it looks,
 * so every kit can ship its own photo and lottery tickets.
 */
export const PHOTO_RECEIPT_TEMPLATE = "photo" as const;
export const LOTTERY_RECEIPT_TEMPLATE = "lottery" as const;
export const RECEIPT_TEMPLATES = [
  PHOTO_RECEIPT_TEMPLATE,
  LOTTERY_RECEIPT_TEMPLATE,
] as const;

export const RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM = "template";

export const receiptTemplateSchema = z.enum(RECEIPT_TEMPLATES);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  [RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM]: receiptTemplateSchema.optional(),
  /** Absent means the default kit. */
  kit: kitIdSchema.optional(),
  outcome: drawOutcomeSchema.optional(),
  prizeId: z.string().optional(),
  title: z.string().optional(),
  winInstruction: z.string().optional(),
  prizeRarity: raritySchema.optional(),
  wonAt: z.string().optional(),
  ticketRef: boothTicketRefSchema.optional(),
  ticketItems: ticketItemNamesSchema.optional(),
});

export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;
export type ReceiptViewerSearch = z.infer<typeof RECEIPT_VIEWER_SEARCH_SCHEMA>;

import z from "zod";

import { drawOutcomeSchema, raritySchema } from "#isomorphic/lottery";

export const RECEIPT_VIEWER_PATH = "/receipt-viewer";

export const PHOTO_RECEIPT_TEMPLATES = ["tartines", "heirvey"] as const;
export const LOTTERY_RECEIPT_TEMPLATE = "lottery" as const;
export const RECEIPT_TEMPLATES = [
  ...PHOTO_RECEIPT_TEMPLATES,
  LOTTERY_RECEIPT_TEMPLATE,
] as const;

export const RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM = "template";

export const photoReceiptTemplateSchema = z.enum(PHOTO_RECEIPT_TEMPLATES);
export const receiptTemplateSchema = z.enum(RECEIPT_TEMPLATES);

export const drawOutcomeSearchSchema = drawOutcomeSchema;

export const DEFAULT_TICKET_ITEM_NAMES = [
  "99stud",
  "El Tony Mate",
  "Épicerie Ginette",
] as const;

export const PHOTO_TICKET_TOTAL_CENTS = 1999;

export const TICKET_ITEM_NAME_MAX_LENGTH = 40;
export const TICKET_ITEM_NAMES_MAX_COUNT = 8;

export const ticketItemNamesSchema = z
  .array(z.string().trim().min(1).max(TICKET_ITEM_NAME_MAX_LENGTH))
  .min(1)
  .max(TICKET_ITEM_NAMES_MAX_COUNT);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  [RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM]: receiptTemplateSchema.optional(),
  outcome: drawOutcomeSearchSchema.optional(),
  prizeId: z.string().optional(),
  title: z.string().optional(),
  winInstruction: z.string().optional(),
  prizeRarity: raritySchema.optional(),
  wonAt: z.string().optional(),
  ticketRef: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  ticketItems: ticketItemNamesSchema.optional(),
});

export type PhotoReceiptTemplate = z.infer<typeof photoReceiptTemplateSchema>;
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;
export type ReceiptViewerSearch = z.infer<typeof RECEIPT_VIEWER_SEARCH_SCHEMA>;
export type DrawOutcomeSearch = z.infer<typeof drawOutcomeSearchSchema>;

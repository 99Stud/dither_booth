import { raritySchema } from "#isomorphic/lottery";
import z from "zod";

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

export const DRAW_OUTCOME_SEARCH_VALUES = ["win", "loss"] as const;
export const drawOutcomeSearchSchema = z.enum(DRAW_OUTCOME_SEARCH_VALUES);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  [RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM]: receiptTemplateSchema.optional(),
  outcome: drawOutcomeSearchSchema.optional(),
  prizeId: z.string().optional(),
  lotLabel: z.string().optional(),
  lotRarity: raritySchema.optional(),
  wonAt: z.string().optional(),
  ticketRef: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export type PhotoReceiptTemplate = z.infer<typeof photoReceiptTemplateSchema>;
export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;
export type ReceiptViewerSearch = z.infer<typeof RECEIPT_VIEWER_SEARCH_SCHEMA>;
export type DrawOutcomeSearch = z.infer<typeof drawOutcomeSearchSchema>;

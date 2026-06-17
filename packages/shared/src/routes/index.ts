import z from "zod";

export const RECEIPT_VIEWER_PATH = "/receipt-viewer";

export const RECEIPT_TEMPLATES = ["tartines", "heirvey"] as const;

export const receiptTemplateSchema = z.enum(RECEIPT_TEMPLATES);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  template: receiptTemplateSchema.optional(),
});

export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;

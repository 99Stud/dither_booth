import z from "zod";

export const RECEIPT_VIEWER_PATH = "/receipt-viewer";

export const RECEIPT_TEMPLATES = ["tartines", "heirvey"] as const;

export const RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM = "template";

export const receiptTemplateSchema = z.enum(RECEIPT_TEMPLATES);

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  [RECEIPT_VIEWER_TEMPLATE_SEARCH_PARAM]: receiptTemplateSchema.optional(),
});

export type ReceiptTemplate = z.infer<typeof receiptTemplateSchema>;

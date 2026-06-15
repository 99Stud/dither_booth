import z from "zod";

export const RECEIPT_VIEWER_SEARCH_SCHEMA = z.object({
  template: z.enum(["tartines", "heirvey"]).optional(),
});

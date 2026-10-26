import { octetInputParser } from "@trpc/server/http";

import { darkroomProcedure } from "#internal/trpc";

/** The Darkroom's preview of the photo receipt, as a PNG. */
export const generateReceipt = darkroomProcedure
  .input(octetInputParser)
  .mutation(async ({ ctx, input }) => {
    const preview = await ctx.tickets.previewPhotoReceipt(input);

    return {
      data: preview.toString("base64"),
      mimeType: "image/png",
    };
  });

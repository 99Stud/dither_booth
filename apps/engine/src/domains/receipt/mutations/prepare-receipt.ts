import { TRPCError } from "@trpc/server";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

const visitIdSchema = z.string().min(1).max(64).nullable();

/**
 * First half of a booth visit: commit the draw and render both tickets while
 * the kiosk plays the slot machine. `printPreparedReceipt` prints them later.
 * FormData: `photo`, and `visitId` from `startVisit` when the kiosk has one.
 */
export const prepareReceipt = boothProcedure
  .input(z.instanceof(FormData))
  .mutation(({ ctx, input }) => {
    const photo = input.get("photo");
    if (!(photo instanceof Blob)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Photo missing." });
    }
    const visitId = visitIdSchema.safeParse(input.get("visitId"));
    if (!visitId.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid visit." });
    }

    return ctx.tickets.prepareVisit(photo, visitId.data);
  });

import { TRPCError } from "@trpc/server";
import z from "zod";

import { visitIdSchema } from "#domains/visit/visit.service";
import { boothProcedure } from "#internal/trpc";

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
    // Analytics never stop a guest: a visit id that can't be one is dropped,
    // and the draw starts its own visit.
    const visitId = visitIdSchema.safeParse(input.get("visitId"));

    return ctx.tickets.prepareVisit(
      photo,
      visitId.success ? visitId.data : null,
    );
  });

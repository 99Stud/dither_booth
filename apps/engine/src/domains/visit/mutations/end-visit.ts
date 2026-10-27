import z from "zod";

import { VISIT_END_REASONS } from "#db/internal/db.schema";
import { boothProcedure } from "#internal/trpc";

/** How the kiosk saw the visit end. Only the first end counts. */
export const endVisit = boothProcedure
  .input(
    z.object({
      visitId: z.string().min(1).max(64),
      reason: z.enum(VISIT_END_REASONS),
    }),
  )
  .mutation(({ ctx, input }) => {
    ctx.visits.end(input.visitId, input.reason);
  });

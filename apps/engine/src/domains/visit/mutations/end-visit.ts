import z from "zod";

import { VISIT_END_REASONS } from "#db/internal/db.schema";
import { boothProcedure } from "#internal/trpc";

import { visitIdSchema } from "../internal/visit.constants";

/** How the kiosk saw the visit end. Only the first end counts. */
export const endVisit = boothProcedure
  .input(
    z.object({
      visitId: visitIdSchema,
      reason: z.enum(VISIT_END_REASONS),
    }),
  )
  .mutation(({ ctx, input }) => {
    ctx.visits.end(input.visitId, input.reason);
  });

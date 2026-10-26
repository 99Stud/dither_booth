import { drawOutcomeSchema } from "@dither-booth/shared/lottery";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { getCurrentEventForDb } from "#domains/event/event.service";
import { darkroomProcedure } from "#internal/trpc";

import { resolveSampleLotteryDraw } from "../internal/sample-lottery-ticket";

export const printSampleLotteryTicket = darkroomProcedure
  .input(
    z.object({
      outcome: drawOutcomeSchema,
      prizeId: z.string().min(1).optional(),
    }),
  )
  .mutation(async ({ ctx, input }): Promise<void> => {
    const current = await getCurrentEventForDb(ctx.db);

    if (!current) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No event is configured.",
      });
    }

    const draw = resolveSampleLotteryDraw({
      outcome: input.outcome,
      prizeId: input.prizeId,
      prizes: current.prizes,
    });

    await ctx.tickets.printSampleLotteryTicket(draw);
  });

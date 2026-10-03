import { adminOriginProcedure } from "#internal/trpc";

import { updateLotterySettingsInputSchema } from "../internal/event.constants";
import { updateLotterySettingsForDb } from "../internal/event.service";

export const updateLotterySettings = adminOriginProcedure
  .input(updateLotterySettingsInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updateLotterySettingsForDb(ctx.db, input);
  });

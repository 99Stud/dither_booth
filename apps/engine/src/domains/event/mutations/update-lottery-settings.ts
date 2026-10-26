import { updateLotterySettingsInputSchema } from "../internal/event.constants";
import { lotteryConfigProcedure } from "../internal/event.kiosk";
import { updateLotterySettingsForDb } from "../internal/event.service";

export const updateLotterySettings = lotteryConfigProcedure
  .input(updateLotterySettingsInputSchema)
  .mutation(async ({ ctx, input }) => {
    return await updateLotterySettingsForDb(ctx.db, input);
  });

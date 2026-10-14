import { configProcedure } from "#internal/trpc";

export const getPrintConfiguration = configProcedure.query(async ({ ctx }) => {
  return await ctx.db.query.printConfigTable.findFirst();
});

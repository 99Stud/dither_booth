import { publicProcedure } from "#internal/trpc";

export const getPrintConfiguration = publicProcedure.query(async ({ ctx }) => {
  return await ctx.db.query.printConfigTable.findFirst();
});

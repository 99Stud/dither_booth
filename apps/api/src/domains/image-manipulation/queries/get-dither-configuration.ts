import { publicProcedure } from "#internal/trpc";

export const getDitherConfiguration = publicProcedure.query(async ({ ctx }) => {
  return await ctx.db.query.printConfigTable.findFirst();
});

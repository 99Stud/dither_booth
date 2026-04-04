import { publicProcedure } from "#trpc.ts";

export const getDitherConfiguration = publicProcedure.query(async ({ ctx }) => {
  return await ctx.db.query.printConfigTable.findFirst();
});

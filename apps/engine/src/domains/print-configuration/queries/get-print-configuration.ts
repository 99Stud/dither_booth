import { darkroomProcedure } from "#internal/trpc";

export const getPrintConfiguration = darkroomProcedure.query(
  async ({ ctx }) => {
    return await ctx.db.query.printConfigTable.findFirst();
  },
);

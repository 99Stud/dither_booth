import { publicProcedure } from "#trpc.ts";

export const getDitherConfiguration = publicProcedure.query(({ ctx }) =>
  ctx.db.query.printConfigTable.findFirst(),
);

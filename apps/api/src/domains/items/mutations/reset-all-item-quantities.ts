import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { itemTable } from "#domains/items/internal/items.schema.ts";

export const resetAllItemQuantities = publicProcedure.mutation(async () => {
  await db.update(itemTable).set({ qty: 0 });
  return { success: true as const };
});

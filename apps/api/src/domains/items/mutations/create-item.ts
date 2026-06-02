import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { CREATE_ITEM_SCHEMA } from "#domains/items/internal/items.constants.ts";
import { itemTable } from "#domains/items/internal/items.schema.ts";

export const createItem = publicProcedure
  .input(CREATE_ITEM_SCHEMA)
  .mutation(async ({ input }) => {
    return db
      .insert(itemTable)
      .values({
        label: input.label,
        qty: input.qty,
        price: input.price,
      })
      .returning()
      .then((rows) => rows[0]!);
  });

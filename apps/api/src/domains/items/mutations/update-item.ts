import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { UPDATE_ITEM_SCHEMA } from "#domains/items/internal/items.constants.ts";
import { itemTable } from "#domains/items/internal/items.schema.ts";

export const updateItem = publicProcedure
  .input(UPDATE_ITEM_SCHEMA)
  .mutation(async ({ input }) => {
    const { id, ...updates } = input;

    const existing = await db.query.itemTable.findFirst({
      where: eq(itemTable.id, id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Item with id ${id} not found.`,
      });
    }

    return db
      .update(itemTable)
      .set(updates)
      .where(eq(itemTable.id, id))
      .returning()
      .then((rows) => rows[0]!);
  });

import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { itemTable } from "#domains/items/internal/items.schema.ts";

export const deleteItem = publicProcedure
  .input(z.object({ id: z.number().int() }))
  .mutation(async ({ input }) => {
    const existing = await db.query.itemTable.findFirst({
      where: eq(itemTable.id, input.id),
    });

    if (!existing) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Item with id ${input.id} not found.`,
      });
    }

    await db.delete(itemTable).where(eq(itemTable.id, input.id));

    return { success: true };
  });

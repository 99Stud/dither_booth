import { asc } from "drizzle-orm";

import { db } from "#db/index.ts";
import { itemTable } from "#domains/items/internal/items.schema.ts";
import { publicProcedure } from "#internal/trpc.ts";

export const getItems = publicProcedure.query(async () => {
  return db.select().from(itemTable).orderBy(asc(itemTable.id));
});

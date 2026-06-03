import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const itemTable = sqliteTable(
  "item",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    label: text("label").notNull(),
    qty: integer("qty").notNull(),
    price: real("price").notNull(),
  },
  (table) => [
    check("item_qty_check", sql`${table.qty} >= 0`),
    check("item_price_check", sql`${table.price} >= 0`),
  ],
);

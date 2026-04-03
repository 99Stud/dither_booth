import type { printConfigTable } from "#db/schema.ts";
import type { InferSelectModel } from "drizzle-orm";

export type PrintConfigRow = InferSelectModel<typeof printConfigTable>;

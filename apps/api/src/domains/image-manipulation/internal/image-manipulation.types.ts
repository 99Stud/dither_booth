import type { printConfigTable } from "#db/internal/db.schema";
import type { InferSelectModel } from "drizzle-orm";

export type PrintConfigRow = InferSelectModel<typeof printConfigTable>;

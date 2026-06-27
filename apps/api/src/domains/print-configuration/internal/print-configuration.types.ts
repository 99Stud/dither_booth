import type { InferSelectModel } from "drizzle-orm";

import type { printConfigTable } from "#db/internal/db.schema";

export type PrintConfigRow = InferSelectModel<typeof printConfigTable>;

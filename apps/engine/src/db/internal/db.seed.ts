import { db } from "#db/index";
import { printConfigTable } from "#db/internal/db.schema";

import { PRINT_CONFIG_SINGLETON_ID } from "./db.constants";

export async function ensureDefaultPrintConfiguration() {
  await db
    .insert(printConfigTable)
    .values({ id: PRINT_CONFIG_SINGLETON_ID })
    .onConflictDoNothing({ target: printConfigTable.id });
}

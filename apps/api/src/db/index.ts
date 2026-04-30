import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "fs";

import { API_DB_FILE_PATH } from "./internal/db.constants";
import { printConfigTable } from "./internal/db.schema";

const dbParentDir = Bun.fileURLToPath(
  new URL(".", Bun.pathToFileURL(API_DB_FILE_PATH)),
);
mkdirSync(dbParentDir, { recursive: true });

export const sqlite = new Database(API_DB_FILE_PATH);
export const db = drizzle({ client: sqlite, schema: { printConfigTable } });

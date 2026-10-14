import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "fs";

import { API_DB_FILE_PATH } from "./internal/db.constants";
import { dbSchema } from "./internal/db.schema";

const dbParentDir = Bun.fileURLToPath(
  new URL(".", Bun.pathToFileURL(API_DB_FILE_PATH)),
);
mkdirSync(dbParentDir, { recursive: true });

export const sqlite = new Database(API_DB_FILE_PATH);
// Off by default in SQLite; draw history depends on these references holding.
sqlite.run("PRAGMA foreign_keys = ON");
export const db = drizzle({
  client: sqlite,
  schema: dbSchema,
});

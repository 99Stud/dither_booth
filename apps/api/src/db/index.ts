import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { printConfigTable } from "./schema";

const dbFileName = process.env.DB_FILE_NAME;

if (!dbFileName) {
  throw new Error(
    "DB_FILE_NAME is required to initialize the SQLite database.",
  );
}

export const sqlite = new Database(dbFileName);
export const db = drizzle({ client: sqlite, schema: { printConfigTable } });

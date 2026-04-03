import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { resolve } from "node:path";

import { db, sqlite } from "./index.ts";
const migrationsFolder = resolve(process.cwd(), "drizzle");
migrate(db, { migrationsFolder });
sqlite.close();
console.log(`Applied SQLite migrations from ${migrationsFolder}.`);

import { defineConfig } from "drizzle-kit";

const dbFileName = process.env.DB_FILE_NAME;

if (!dbFileName) {
  throw new Error(
    "DB_FILE_NAME is required to generate or apply SQLite migrations.",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/internal/db.schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbFileName,
  },
});

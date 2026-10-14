import { defineConfig } from "drizzle-kit";

import { API_DB_FILE_PATH } from "#db/internal/db.constants";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/internal/db.schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: API_DB_FILE_PATH,
  },
});

import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["react"],
  env: {
    browser: true,
  },
  categories: {
    correctness: "warn",
  },
  rules: {
    "eslint/no-unused-vars": "error",
  },
  ignorePatterns: ["dist"],
});

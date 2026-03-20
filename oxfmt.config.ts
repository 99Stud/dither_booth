import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  sortTailwindcss: {
    stylesheet: "./apps/web/src/styles/globals.css",
    functions: ["clsx", "cn"],
  },
});

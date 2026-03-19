import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  sortTailwindcss: {
    stylesheet: "./src/globals.css",
    functions: ["clsx", "cn"],
  },
});

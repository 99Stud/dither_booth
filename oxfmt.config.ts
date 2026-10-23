import { defineConfig } from "oxfmt";

export default defineConfig({
  sortImports: {
    groups: [
      "type-import",
      ["value-builtin", "value-external"],
      "type-internal",
      "value-internal",
      ["type-parent", "type-sibling", "type-index"],
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
  printWidth: 80,
  sortTailwindcss: {
    stylesheet: "./apps/shutter/src/styles/globals.css",
    functions: ["clsx", "cn"],
  },
  ignorePatterns: [
    ".agents/**",
    ".cursor/**",
    "AGENTS.md",
    "skills-lock.json",
    "bun.lock",
    // Go templates (Supabase Auth emails): the formatter would wrap lines
    // inside `{{ … }}`.
    "supabase/templates/**",
  ],
});

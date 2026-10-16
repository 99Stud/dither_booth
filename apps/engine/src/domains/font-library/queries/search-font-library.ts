import z from "zod";

import { configProcedure } from "#internal/trpc";

import { searchFontLibrary } from "../internal/font-library.service";

/** Google Fonts with a latin subset, by family name. Needs the internet. */
export const searchFontLibraryProcedure = configProcedure
  .input(z.object({ query: z.string().trim().max(60) }))
  .query(async ({ input }) => await searchFontLibrary({}, input.query));

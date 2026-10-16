import { logKioskEvent } from "@dither-booth/logging";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import {
  FONT_ASSETS_DIR,
  FONT_LIBRARY_LOG_SOURCE,
} from "../internal/font-library.constants";
import { installLibraryFont } from "../internal/font-library.service";

/** Downloads a Google font onto the booth, so it works offline. */
export const installLibraryFontProcedure = configProcedure
  .input(z.object({ fontsourceId: z.string().regex(/^[a-z0-9-]{1,80}$/u) }))
  .mutation(async ({ ctx, input }) => {
    const asset = await installLibraryFont(
      { db: ctx.db, fontsDir: FONT_ASSETS_DIR },
      input.fontsourceId,
    );
    logKioskEvent("info", FONT_LIBRARY_LOG_SOURCE, "font-installed", {
      details: { assetId: asset.id, family: asset.family },
    });
    return asset;
  });

import z from "zod";

import { boothProcedure } from "#internal/trpc";

import { FONT_ASSETS_DIR } from "../internal/font-library.constants";
import { readFontAsset } from "../internal/font-library.service";

/**
 * An added font's woff2 files, for the kiosk and the tickets to register.
 * Public: it is a font the booth shows anyway.
 */
export const getFontAssetProcedure = boothProcedure
  .input(z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/u) }))
  .query(
    async ({ ctx, input }) =>
      await readFontAsset({ db: ctx.db, fontsDir: FONT_ASSETS_DIR }, input.id),
  );

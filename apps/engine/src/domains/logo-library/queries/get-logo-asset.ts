import { logoAssetIdSchema } from "@dither-booth/shared/kit-partners";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

import { LOGO_ASSETS_DIR } from "../internal/logo-library.constants";
import { readLogoAsset } from "../internal/logo-library.service";

/**
 * An added logo's PNG, for the partner row and admin's previews.
 * Public: it is a logo the booth prints anyway.
 */
export const getLogoAssetProcedure = boothProcedure
  .input(z.object({ id: logoAssetIdSchema }))
  .query(
    async ({ ctx, input }) =>
      await readLogoAsset({ db: ctx.db, logosDir: LOGO_ASSETS_DIR }, input.id),
  );

import { logoAssetIdSchema } from "@dither-booth/shared/kit-partners";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import { LOGO_ASSETS_DIR } from "../internal/logo-library.constants";
import { deleteLogoAsset } from "../internal/logo-library.service";

/** Removes an added logo, unless the event still prints it. */
export const deleteLogoAssetProcedure = configProcedure
  .input(z.object({ id: logoAssetIdSchema }))
  .mutation(async ({ ctx, input }) => {
    await deleteLogoAsset({ db: ctx.db, logosDir: LOGO_ASSETS_DIR }, input.id);
    return { deleted: true };
  });

import z from "zod";

import { configProcedure } from "#internal/trpc";

import { FONT_ASSETS_DIR } from "../internal/font-library.constants";
import { deleteFontAsset } from "../internal/font-library.service";

/** Removes an added font, unless the event still uses it. */
export const deleteFontAssetProcedure = configProcedure
  .input(z.object({ id: z.string().regex(/^[a-z0-9]{8,40}$/u) }))
  .mutation(async ({ ctx, input }) => {
    await deleteFontAsset({ db: ctx.db, fontsDir: FONT_ASSETS_DIR }, input.id);
    return { deleted: true };
  });

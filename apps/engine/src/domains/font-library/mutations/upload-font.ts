import { logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import {
  FONT_ASSETS_DIR,
  FONT_LIBRARY_LOG_SOURCE,
} from "../internal/font-library.constants";
import { uploadFont } from "../internal/font-library.service";

const uploadFieldsSchema = z.object({
  family: z.string().trim().min(1).max(60),
  weight: z.coerce.number().int().min(100).max(900).multipleOf(100),
  licenseConfirmed: z.literal("true", {
    message: "Confirm you may use this font at the event.",
  }),
});

/**
 * A woff2 font staff upload (FormData: `file`, `family`, `weight`,
 * `licenseConfirmed`). The file must really be woff2, up to 2 MB.
 */
export const uploadFontProcedure = configProcedure
  .input(z.instanceof(FormData))
  .mutation(async ({ ctx, input }) => {
    const file = input.get("file");
    if (!(file instanceof File)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a file." });
    }
    const fields = uploadFieldsSchema.safeParse(
      Object.fromEntries(
        ["family", "weight", "licenseConfirmed"].map((key) => [
          key,
          input.get(key),
        ]),
      ),
    );
    if (!fields.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: fields.error.issues[0]?.message ?? "Invalid upload.",
      });
    }
    const asset = await uploadFont(
      { db: ctx.db, fontsDir: FONT_ASSETS_DIR },
      {
        family: fields.data.family,
        weight: fields.data.weight,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    logKioskEvent("info", FONT_LIBRARY_LOG_SOURCE, "font-uploaded", {
      details: { assetId: asset.id, family: asset.family },
    });
    return asset;
  });

import { logKioskEvent } from "@dither-booth/logging";
import { TRPCError } from "@trpc/server";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import {
  LOGO_ASSETS_DIR,
  LOGO_LIBRARY_LOG_SOURCE,
} from "../internal/logo-library.constants";
import { uploadLogo } from "../internal/logo-library.service";

const uploadFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name the logo.").max(60),
});

/**
 * A PNG or SVG logo staff upload (FormData: `file`, `name`), up to 2 MB.
 * It is kept as it will print, in black and white.
 */
export const uploadLogoProcedure = configProcedure
  .input(z.instanceof(FormData))
  .mutation(async ({ ctx, input }) => {
    const file = input.get("file");
    if (!(file instanceof File)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a file." });
    }
    const fields = uploadFieldsSchema.safeParse({ name: input.get("name") });
    if (!fields.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: fields.error.issues[0]?.message ?? "Invalid upload.",
      });
    }
    const asset = await uploadLogo(
      { db: ctx.db, logosDir: LOGO_ASSETS_DIR },
      {
        name: fields.data.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    logKioskEvent("info", LOGO_LIBRARY_LOG_SOURCE, "logo-uploaded", {
      details: { assetId: asset.id, name: asset.name },
    });
    return asset;
  });

import { configProcedure } from "#internal/trpc";

import { listFontAssets } from "../internal/font-library.service";

/** Fonts added to this booth, which any kit role can use. */
export const listFontAssetsProcedure = configProcedure.query(({ ctx }) =>
  listFontAssets({ db: ctx.db }),
);

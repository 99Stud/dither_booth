import { configProcedure } from "#internal/trpc";

import { listLogoAssets } from "../internal/logo-library.service";

/** Logos added to this booth, which an event can print as partners. */
export const listLogoAssetsProcedure = configProcedure.query(({ ctx }) =>
  listLogoAssets({ db: ctx.db }),
);

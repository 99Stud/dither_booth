import { captiveProcedure } from "#internal/trpc";

import { wifiNetworkInput } from "../internal/network.input";
import { asNetworkRequest } from "../internal/network.procedure";
import { joinFromCaptive as join } from "../internal/network.service";

/** Joins the venue's network from the booth Wi-Fi's captive page. */
export const joinFromCaptive = captiveProcedure
  .input(wifiNetworkInput.omit({ connectNow: true }))
  .mutation(({ ctx, input }) =>
    asNetworkRequest(() => join(ctx.network, input)),
  );

import {
  asNetworkRequest,
  wifiNetworkInput,
} from "#domains/network/network.service";
import { captiveProcedure } from "#internal/trpc";

import { joinFromCaptive as join } from "../internal/captive.service";

/** Joins the venue's network from the booth Wi-Fi's captive page. */
export const joinFromCaptive = captiveProcedure
  .input(wifiNetworkInput.omit({ connectNow: true }))
  .mutation(({ ctx, input }) =>
    asNetworkRequest(() => join(ctx.network, input)),
  );

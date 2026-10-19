import { TRPCError } from "@trpc/server";

import { captiveProcedure } from "#internal/trpc";

import { wifiNetworkInput } from "../internal/network.input";
import { asNetworkRequest } from "../internal/network.procedure";
import { getCaptiveStatus, saveWifiNetwork } from "../internal/network.service";

/**
 * Joins the venue's network from the captive page. Only while the booth is on
 * its own Wi-Fi for want of a network: during an event on the booth Wi-Fi, a
 * guest who joined it can't move the booth.
 */
export const joinFromCaptive = captiveProcedure
  .input(wifiNetworkInput.omit({ connectNow: true }))
  .mutation(async ({ ctx, input }) => {
    const { state } = await getCaptiveStatus(ctx.network);

    if (state !== "pick-network") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "The booth isn't waiting for a network.",
      });
    }
    await asNetworkRequest(() =>
      saveWifiNetwork(ctx.network, { ...input, connectNow: true }),
    );
  });

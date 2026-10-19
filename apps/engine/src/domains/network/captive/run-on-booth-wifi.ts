import { TRPCError } from "@trpc/server";

import { captiveProcedure } from "#internal/trpc";

import { asNetworkRequest } from "../internal/network.procedure";
import { getCaptiveStatus, setBoothWifi } from "../internal/network.service";

/** Keeps the booth on its own Wi-Fi for the event; the captive page goes away. */
export const runOnBoothWifi = captiveProcedure.mutation(async ({ ctx }) => {
  const { state } = await getCaptiveStatus(ctx.network);

  if (state === "not-on-booth-wifi") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The booth isn't on its own Wi-Fi.",
    });
  }
  await asNetworkRequest(() => setBoothWifi(ctx.network, { enabled: true }));
});

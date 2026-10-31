import { darkroomPinSchema } from "@dither-booth/shared/darkroom";

import {
  asNetworkRequest,
  wifiNetworkInput,
} from "#domains/network/network.service";
import { captiveProcedure } from "#internal/trpc";

import { joinFromCaptive as join } from "../internal/captive.service";

/**
 * Joins the venue's network from the booth Wi-Fi's captive page. Asks for
 * the staff PIN: the Wi-Fi ticket's password can end up with a guest, who
 * must not move the booth to another network.
 */
export const joinFromCaptive = captiveProcedure
  .input(
    wifiNetworkInput
      .omit({ connectNow: true })
      .extend({ pin: darkroomPinSchema }),
  )
  .mutation(async ({ ctx, input: { pin, ...network } }) => {
    await ctx.darkroomAccess.checkPin(pin);
    return asNetworkRequest(() => join(ctx.network, network));
  });

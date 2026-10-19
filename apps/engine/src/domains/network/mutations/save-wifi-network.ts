import { darkroomProcedure } from "#internal/trpc";

import { wifiNetworkInput } from "../internal/network.input";
import { asNetworkRequest } from "../internal/network.procedure";
import { saveWifiNetwork as save } from "../internal/network.service";

export const saveWifiNetwork = darkroomProcedure
  .input(wifiNetworkInput)
  .mutation(({ ctx, input }) =>
    asNetworkRequest(() => save(ctx.network, input)),
  );

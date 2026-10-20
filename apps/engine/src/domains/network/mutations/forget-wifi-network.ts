import z from "zod";

import { darkroomProcedure } from "#internal/trpc";

import { asNetworkRequest } from "../internal/network.procedure";
import { forgetWifiNetwork as forget } from "../internal/network.service";

export const forgetWifiNetwork = darkroomProcedure
  .input(z.object({ ssid: z.string().min(1) }))
  .mutation(({ ctx, input }) =>
    asNetworkRequest(() => forget(ctx.network, input)),
  );

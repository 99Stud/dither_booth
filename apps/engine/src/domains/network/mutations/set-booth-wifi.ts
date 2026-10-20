import z from "zod";

import { darkroomProcedure } from "#internal/trpc";

import { asNetworkRequest } from "../internal/network.procedure";
import { setBoothWifi as set } from "../internal/network.service";

export const setBoothWifi = darkroomProcedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(({ ctx, input }) =>
    asNetworkRequest(() => set(ctx.network, input)),
  );

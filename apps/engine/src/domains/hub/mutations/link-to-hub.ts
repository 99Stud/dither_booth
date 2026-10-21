import { logKioskEvent } from "@dither-booth/logging";
import { registrationCodeSchema } from "@dither-booth/protocol/registration";
import z from "zod";

import { configProcedure } from "#internal/trpc";

import { linkToHub as linkBoothToHub } from "../internal/hub-link.service";
import { getHubEndpoint, HUB_LOG_SOURCE } from "../internal/hub.constants";

/** Registers the booth with the Hub, with a one-time code staff issued. */
export const linkToHub = configProcedure
  .input(z.object({ code: registrationCodeSchema }))
  .mutation(async ({ ctx, input }) => {
    const status = await linkBoothToHub(
      { db: ctx.db, hub: getHubEndpoint() },
      input.code,
    );
    logKioskEvent("info", HUB_LOG_SOURCE, "hub-linked", {
      details: status.linked
        ? { boothId: status.boothId, hubUrl: status.hubUrl }
        : {},
    });
    return status;
  });

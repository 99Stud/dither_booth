import { logKioskEvent } from "@dither-booth/logging";
import { registrationRequestSchema } from "@dither-booth/protocol/registration";

import { configProcedure } from "#internal/trpc";
import { getHubOverride } from "#lib/runtime-flags/runtime-flags";

import { registerBooth } from "../internal/hub-registration.service";
import { HUB_LOG_SOURCE, PRODUCTION_HUB } from "../internal/hub.constants";

/** Registers the booth with the Hub, with a one-time code staff issued. */
export const registerWithHub = configProcedure
  .input(registrationRequestSchema)
  .mutation(async ({ ctx, input }) => {
    const registration = await registerBooth(
      { db: ctx.db, hub: getHubOverride() ?? PRODUCTION_HUB },
      input.code,
    );
    logKioskEvent("info", HUB_LOG_SOURCE, "hub-registered", {
      details: { boothId: registration.boothId, hubUrl: registration.hubUrl },
    });
    return registration;
  });

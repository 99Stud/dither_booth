import { TRPCError } from "@trpc/server";

import { PrinterUnavailableError } from "#domains/printer/printer.service";
import { darkroomProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

import { getDeviceSetupLinks } from "../internal/device-setup.links";
import { buildSetupTicket } from "../internal/device-setup.ticket";

/** Prints the setup ticket now, for one more device. */
export const printSetupTicket = darkroomProcedure.mutation(
  async ({ ctx }): Promise<void> => {
    const links = await getDeviceSetupLinks({ repoRoot: ENGINE_REPO_ROOT });

    try {
      await ctx.printer.print(buildSetupTicket(links), { content: "escpos" });
    } catch (error) {
      if (error instanceof PrinterUnavailableError) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error.message,
          cause: error,
        });
      }
      throw error;
    }
  },
);

import { TRPCError } from "@trpc/server";

import { PrinterUnavailableError } from "#domains/printer/printer.service";
import { darkroomProcedure } from "#internal/trpc";
import { ENGINE_REPO_ROOT } from "#lib/constants";

import { getCurrentSetupTicket } from "../internal/device-setup.current-ticket";

/**
 * Prints the setup ticket now, for one more device: the booth Wi-Fi ticket
 * while the booth is on its own Wi-Fi.
 */
export const printSetupTicket = darkroomProcedure.mutation(
  async ({ ctx }): Promise<void> => {
    const ticket = await getCurrentSetupTicket(ctx.network, {
      repoRoot: ENGINE_REPO_ROOT,
    });

    if (!ticket) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "The booth is between networks. Try again in a moment.",
      });
    }

    try {
      await ctx.printer.print(ticket.build(), { content: "escpos" });
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

import { buildReceiptViewerUrl } from "#domains/browser-automation/internal/receipt-viewer-url.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { API_BROWSER_LOG_SOURCE } from "#lib/browser/browser.constants.ts";
import { getKioskErrorDiagnostics, logKioskEvent } from "@dither-booth/logging";
import {
  assertTicketNames,
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
} from "@dither-booth/moderation";
import { z } from "zod";

const PRIME_TIMEOUT_MS = 15_000;

export const primeReceipt = publicProcedure
  .input(
    z.object({
      names: z.array(z.string().max(MAX_TICKET_NAME_LENGTH)).max(MAX_TICKET_NAMES).optional(),
      clientFlowId: z.uuid().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const names =
      input.names
        ?.map((n) => n.trim())
        .filter(Boolean)
        .slice(0, MAX_TICKET_NAMES) ?? [];

    assertTicketNames(names);

    if (!ctx.receiptPageSlot) {
      return { warm: false } as const;
    }

    const url = buildReceiptViewerUrl(names);

    try {
      await Promise.race([
        ctx.receiptPageSlot.prime(url),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("prime timeout")), PRIME_TIMEOUT_MS),
        ),
      ]);

      logKioskEvent("info", API_BROWSER_LOG_SOURCE, "prime-receipt-done", {
        details: {
          warm: true,
          url,
          ...(input.clientFlowId ? { clientFlowId: input.clientFlowId } : {}),
        },
      });

      return { warm: true } as const;
    } catch (error) {
      logKioskEvent("warn", API_BROWSER_LOG_SOURCE, "prime-receipt-failed", {
        error: getKioskErrorDiagnostics(error, "Receipt pre-warm failed."),
      });
      return { warm: false } as const;
    }
  });

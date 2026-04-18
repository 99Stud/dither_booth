import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import { Receipt } from "#components/misc/Receipt/index.tsx";
import { validateTicketNames } from "@dither-booth/moderation";
import { parseAsString, useQueryState } from "nuqs";
import type { FC } from "react";

export const ReceiptViewer: FC = () => {
  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const [ticketRef] = useQueryState("ticketRef", parseAsString);
  const names = normalizeTicketNames(ticketRaw ?? []);
  const namesValidation = validateTicketNames(names);

  const receiptTicketRef =
    ticketRef && /^\d{6}$/.test(ticketRef) ? ticketRef : undefined;

  return (
    <div className="min-h-dvh bg-zinc-100 p-3 text-black">
      <Receipt
        className="mx-auto"
        names={namesValidation.ok && names.length > 0 ? names : undefined}
        ticketRef={receiptTicketRef}
      />
    </div>
  );
};

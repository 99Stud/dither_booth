import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import { Receipt } from "#components/misc/Receipt/index.tsx";
import { validateTicketNames } from "@dither-booth/moderation";
import { useQueryState } from "nuqs";
import type { FC } from "react";

export const ReceiptViewer: FC = () => {
  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const names = normalizeTicketNames(ticketRaw ?? []);
  const namesValidation = validateTicketNames(names);

  return (
    <div className="min-h-dvh bg-black p-4">
      <Receipt
        className="mx-auto"
        names={namesValidation.ok && names.length > 0 ? names : undefined}
      />
    </div>
  );
};

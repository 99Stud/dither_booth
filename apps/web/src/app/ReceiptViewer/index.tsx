import { normalizeTicketNames, ticketNamesParser } from "#lib/ticket-names.ts";
import { Receipt } from "#components/misc/Receipt/index.tsx";
import { useQueryState } from "nuqs";
import type { FC } from "react";

export const ReceiptViewer: FC = () => {
  const [ticketRaw] = useQueryState("ticket", ticketNamesParser);
  const names = normalizeTicketNames(ticketRaw ?? []);

  return (
    <div className="min-h-dvh bg-black p-4">
      <Receipt className="mx-auto" names={names.length > 0 ? names : undefined} />
    </div>
  );
};

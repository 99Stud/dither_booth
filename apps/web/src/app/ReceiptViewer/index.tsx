import type { FC } from "react";

import { validateTicketNames } from "@dither-booth/moderation";

import { HeirveyReceipt } from "#components/misc/HeirveyReceipt/index.tsx";
import { Receipt } from "#components/misc/Receipt/index.tsx";
import { receiptViewerRoute } from "#lib/router/index.tsx";
import { HEIRVEY_RECEIPT_TEMPLATE } from "#lib/router/internal/router.constants.tsx";
import { normalizeTicketNames } from "#lib/ticket-names.ts";

export const ReceiptViewer: FC = () => {
  const { template, ticket, ticketRef } = receiptViewerRoute.useSearch();
  const names = normalizeTicketNames(ticket ?? []);
  const namesValidation = validateTicketNames(names);

  const receiptTicketRef =
    ticketRef && /^\d{6}$/.test(ticketRef) ? ticketRef : undefined;

  return (
    <div className="min-h-dvh bg-zinc-100 p-3 text-black">
      {template === HEIRVEY_RECEIPT_TEMPLATE ? (
        <HeirveyReceipt className="mx-auto" />
      ) : (
        <Receipt
          className="mx-auto"
          names={namesValidation.ok && names.length > 0 ? names : undefined}
          ticketRef={receiptTicketRef}
        />
      )}
    </div>
  );
};

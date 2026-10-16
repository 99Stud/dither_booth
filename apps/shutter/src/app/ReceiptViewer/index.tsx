import type { FC } from "react";

import { RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE } from "@dither-booth/shared/browser/receipt-viewer";

import { getKitTicket } from "#kits/index";
import { useKitQuery } from "#kits/useKit";
import { receiptViewerRoute } from "#lib/router/index";

export const ReceiptViewer: FC = () => {
  const { kit, template } = receiptViewerRoute.useSearch();
  const { data: kitData, isError } = useKitQuery();

  // No template attribute until the kit's text is in, so the engine never
  // screenshots a ticket with missing copy.
  if (!kitData) {
    return (
      <div className="min-h-dvh bg-black p-4">
        <p className="text-white">
          {isError ? "Could not load the kit" : "Loading kit"}
        </p>
      </div>
    );
  }

  // The engine names the kit; admin's preview sends it with the draft.
  const Ticket = template
    ? getKitTicket(kit ?? kitData.kitId, template)
    : undefined;

  return (
    <div
      className="min-h-dvh bg-black p-4"
      {...{ [RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE]: template ?? "" }}
    >
      {Ticket ? (
        <Ticket className="mx-auto" />
      ) : (
        <p className="text-white">No template selected</p>
      )}
    </div>
  );
};

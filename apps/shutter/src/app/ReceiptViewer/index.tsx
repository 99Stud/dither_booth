import type { FC } from "react";

import { RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE } from "@dither-booth/shared/browser/receipt-viewer";

import { getKitTicket } from "#kits/index";
import { receiptViewerRoute } from "#lib/router/index";

export const ReceiptViewer: FC = () => {
  const { kit, template } = receiptViewerRoute.useSearch();

  const Ticket = template ? getKitTicket(kit, template) : undefined;

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

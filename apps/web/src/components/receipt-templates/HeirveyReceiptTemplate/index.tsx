import type { FC } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { formatBoothTicketNumber } from "@dither-booth/shared/formatting";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

import { receiptViewerRoute } from "#lib/router/index";

export const HeirveyReceiptTemplate: FC<{ className?: string }> = (props) => {
  const { className } = props;
  const { ticketRef } = receiptViewerRoute.useSearch();
  const ticketNumber = ticketRef ? formatBoothTicketNumber(ticketRef) : null;

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      className={cn("bg-background", "font-bit leading-none", className)}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <h1>Heirvey Receipt Template</h1>
      {ticketNumber ? (
        <p className={clsx("text-center text-3xl")}>{ticketNumber}</p>
      ) : null}
    </div>
  );
};

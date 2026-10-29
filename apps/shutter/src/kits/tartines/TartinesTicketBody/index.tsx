import {
  formatBoothTicketNumber,
  formatPrice,
} from "@dither-booth/shared/formatting";
import { cn } from "@dither-booth/shared/styles";
import {
  DEFAULT_TICKET_ITEM_NAMES,
  PHOTO_TICKET_TOTAL_CENTS,
} from "@dither-booth/shared/ticket";
import { NinetyNineStudQR } from "@dither-booth/ui/components/svg/99studQR/index";
import { DitherBoothBadge } from "@dither-booth/ui/components/svg/DitherBoothBadge/index";
import clsx from "clsx";
import { format } from "date-fns";
import { Sparkles } from "pixelarticons/react/Sparkles.js";
import { type FC, useMemo } from "react";

import { KitText } from "#kits/KitText/index";
import { PartnerRow } from "#kits/PartnerRow/index";
import { useKitCopy } from "#kits/useKit";
import { receiptViewerRoute } from "#lib/router/index";
const RECEIPT_QUANTITY_LABEL = "1x";
const RECEIPT_QUANTITY_CLASSNAME = clsx(
  "shrink-0 font-mono text-2xl font-normal tabular-nums",
);
const RECEIPT_PRICE_CLASSNAME = clsx(
  "shrink-0 font-mono text-2xl font-normal tabular-nums",
);
const PRICE_CURRENCY_SUFFIX = formatPrice(0).replace(/^.*\d/u, "");

const randomPriceSplit = (total: number, count: number): number[] => {
  if (count < 1) {
    return [];
  }

  const minPrice = 1;
  const partCount = Math.min(count, total);
  let remainder = total - partCount * minPrice;
  const extras = Array.from({ length: partCount }, () => 0);

  for (let index = 0; index < partCount - 1; index += 1) {
    const extra = Math.floor(Math.random() * (remainder + 1));
    extras[index] = extra;
    remainder -= extra;
  }

  extras[partCount - 1] = remainder;

  return extras.map((extra) => minPrice + extra);
};

/**
 * Everything below the photo on Tartines' photo ticket: date, venue, items,
 * total, the event's partner row, QR, ticket number and the DitherBooth
 * badge. Other kits reuse it under their own header.
 */
export const TartinesTicketBody: FC = () => {
  const { ticketItems, ticketRef } = receiptViewerRoute.useSearch();
  const copy = useKitCopy();
  const ticketNumber = ticketRef ? formatBoothTicketNumber(ticketRef) : null;
  const today = new Date();
  const itemNames = ticketItems ?? DEFAULT_TICKET_ITEM_NAMES;
  const prices = useMemo(
    () => randomPriceSplit(PHOTO_TICKET_TOTAL_CENTS, itemNames.length),
    // ticketRef is unused by the split; a new ticket still needs a new roll.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- re-roll per ticket
    [itemNames, ticketRef],
  );

  return (
    <div className={clsx("mx-4 pb-10")}>
      <div className={clsx("pt-16", "flex flex-col gap-12")}>
        <div
          className={clsx(
            "flex items-center justify-between",
            "leading-[0.7] font-bold",
          )}
        >
          <p>{format(today, "dd/MM/yyyy")}</p>
          <p>{format(today, "HH:mm:ss")}</p>
        </div>
        <div className={clsx("flex flex-col items-center")}>
          {copy["photoTicket.venueName"] ? (
            <p className={clsx("font-bit text-5xl font-bold")}>
              <KitText text={copy["photoTicket.venueName"]} />
            </p>
          ) : null}
          {copy["photoTicket.venueAddress"] ? (
            <p className={clsx("font-bit text-4xl italic")}>
              <KitText text={copy["photoTicket.venueAddress"]} />
            </p>
          ) : null}
        </div>
      </div>
      <AsteriskLine />
      <div className={clsx("flex flex-col gap-8")}>
        <p className={clsx("text-center leading-[0.7] font-bold underline")}>
          <KitText text={copy["photoTicket.itemsTitle"]} />
        </p>
        <div className={clsx("flex flex-col gap-4", "font-bold")}>
          {itemNames.map((name, index) => (
            <ReceiptItem
              key={`${index}-${name}`}
              quantity={1}
              name={name}
              price={prices[index] ?? 0}
            />
          ))}
        </div>
      </div>
      <AsteriskLine className={clsx("mb-6")} />
      <div
        className={clsx(
          "flex items-center justify-between bg-black text-white",
        )}
      >
        <div className={clsx("flex items-center gap-4")}>
          <span
            aria-hidden
            className={cn(RECEIPT_QUANTITY_CLASSNAME, "invisible font-bold")}
          >
            {RECEIPT_QUANTITY_LABEL}
          </span>
          <p className={clsx("mt-1 leading-[0.7] font-bold")}>
            <KitText text={copy["photoTicket.totalLabel"]} />
          </p>
        </div>
        <p className={clsx("font-mono text-2xl font-bold tabular-nums")}>
          {formatPrice(PHOTO_TICKET_TOTAL_CENTS)}
        </p>
      </div>
      <AsteriskLine className={clsx("mt-6")} />
      <PartnerRow separator={<AsteriskLine />} />
      <div className={clsx("flex flex-col items-center")}>
        {copy["photoTicket.socialPrompt"] ? (
          <p>
            <KitText text={copy["photoTicket.socialPrompt"]} />
          </p>
        ) : null}
        {copy["photoTicket.socialHandle"] ? (
          <p className={clsx("font-bit text-4xl font-bold")}>
            <KitText text={copy["photoTicket.socialHandle"]} />
          </p>
        ) : null}
      </div>
      <NinetyNineStudQR className={clsx("mx-auto mb-8", "w-1/2")} />
      {copy["photoTicket.thanks"] ? (
        <p
          className={clsx(
            "mb-4 flex items-center justify-center gap-3 text-4xl font-bold",
          )}
        >
          <Sparkles className="size-8 shrink-0" aria-hidden />
          <KitText text={copy["photoTicket.thanks"]} />
          <Sparkles className="size-8 shrink-0" aria-hidden />
        </p>
      ) : null}
      {ticketNumber ? (
        <p className={clsx("text-center text-3xl font-bold")}>{ticketNumber}</p>
      ) : null}
      <DitherBoothBadge className={clsx("mx-auto mt-12", "h-14")} />
    </div>
  );
};

interface ReceiptItemProps {
  quantity: number;
  name: string;
  price: number;
}
const ReceiptItem: FC<ReceiptItemProps> = ({ quantity, name, price }) => {
  return (
    <div className={clsx("flex items-center justify-between gap-12")}>
      <div className={clsx("flex min-w-0 flex-1 items-center gap-4")}>
        <p className={RECEIPT_QUANTITY_CLASSNAME}>{quantity}x</p>
        <p className={clsx("mt-1 min-w-0 truncate leading-[0.7]")}>{name}</p>
      </div>
      <p className={RECEIPT_PRICE_CLASSNAME}>{formatPrice(price)}</p>
    </div>
  );
};

const AsteriskLine: FC<{ className?: string }> = (props) => {
  const { className } = props;

  return (
    <div aria-hidden className={cn("mt-8 flex items-center", className)}>
      <span className={cn(RECEIPT_QUANTITY_CLASSNAME, "invisible")}>
        {RECEIPT_QUANTITY_LABEL}
      </span>
      <span className="ml-2 min-w-0 flex-1 overflow-hidden leading-none font-bold whitespace-nowrap italic">
        {"*".repeat(80)}
      </span>
      <span className={cn(RECEIPT_PRICE_CLASSNAME, "invisible whitespace-pre")}>
        {PRICE_CURRENCY_SUFFIX}
      </span>
    </div>
  );
};

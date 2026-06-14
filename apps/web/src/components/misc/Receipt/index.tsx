import type { FC } from "react";

import clsx from "clsx";
import { format } from "date-fns";
import { useMemo } from "react";

import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index.tsx";
import { DitherBoothLogotypeMark } from "#components/svg/DitherBoothLogotypeMark/index.tsx";
import { FramerEventQR } from "#components/svg/FramerEventQR/index.tsx";
import { FramerLogo } from "#components/svg/FramerLogo/index.tsx";
import { formatBoothTicketNumber } from "#lib/ticket-ref.ts";
import { cn, mmToPx } from "#lib/utils.ts";

const RECEIPT_TOTAL_EUR = 1606.26;
const LAST_LINE_EUR = 99.99;

const formatReceiptEuro = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    amount,
  );

/** Random positive amounts (cent precision) that sum to `totalEur`; last entry is always €99.99. */
const randomPartitionEur = (totalEur: number, parts: number): number[] => {
  if (parts <= 0) return [];
  if (parts === 1) return [LAST_LINE_EUR];

  const remainderEur = totalEur - LAST_LINE_EUR;
  const leadingParts = parts - 1;
  const totalCents = Math.round(remainderEur * 100);

  let leadingAmounts: number[];
  if (totalCents < leadingParts) {
    const each = remainderEur / leadingParts;
    leadingAmounts = Array.from({ length: leadingParts }, () => each);
  } else {
    const cuts = new Set<number>();
    while (cuts.size < leadingParts - 1) {
      cuts.add(Math.floor(Math.random() * (totalCents - 1)) + 1);
    }
    const sorted = [0, ...Array.from(cuts).sort((a, b) => a - b), totalCents];
    leadingAmounts = [];
    for (let i = 0; i < leadingParts; i++) {
      leadingAmounts.push((sorted[i + 1]! - sorted[i]!) / 100);
    }
  }

  return [...leadingAmounts, LAST_LINE_EUR];
};

interface ReceiptProps {
  className?: string;
  /** Printed on the ticket line items; falls back to placeholder copy when empty. */
  names?: string[];
  /** Six-digit serial; must match lottery ticket when both are printed. */
  ticketRef?: string;
}

export const Receipt: FC<ReceiptProps> = (props) => {
  const { className, names, ticketRef } = props;
  const today = new Date();

  const ticketNumber = useMemo(() => {
    if (ticketRef && /^\d{6}$/.test(ticketRef))
      return formatBoothTicketNumber(ticketRef);
    return formatBoothTicketNumber(
      Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, "0"),
    );
  }, [ticketRef]);

  const { lineItems, totalPrice } = useMemo(() => {
    const rows =
      names && names.length > 0
        ? names.map((name) => ({ qty: "1x" as const, label: name }))
        : [
            { qty: "1x" as const, label: "Framer" },
            { qty: "1x" as const, label: "Virgil Caffier" },
            { qty: "1x" as const, label: "99stud" },
          ];
    const amountsEur = randomPartitionEur(RECEIPT_TOTAL_EUR, rows.length);
    const lineItems = rows.map((row, i) => ({
      ...row,
      price: formatReceiptEuro(amountsEur[i] ?? 0),
    }));
    return { lineItems, totalPrice: formatReceiptEuro(RECEIPT_TOTAL_EUR) };
  }, [names]);

  return (
    <div
      id="receipt"
      className={cn(
        "flex flex-col gap-4",
        "bg-white text-black",
        "[&_svg]:text-black",
        "font-bit leading-none",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <FramerLogo className={clsx("z-10", "w-1/2", "mx-auto")} />
      <div className={clsx("relative w-full overflow-visible bg-white")}>
        <div className={clsx("relative aspect-square w-full overflow-visible")}>
          <img
            id="booth-photo"
            className={clsx("relative z-0 h-full w-full object-cover")}
            src="https://picsum.photos/200"
            alt="booth photo"
          />
        </div>
      </div>
      <div className={clsx("flex items-center justify-between")}>
        <div className={clsx("flex w-full flex-col gap-2")}>
          <div
            className={clsx(
              "flex w-full items-center justify-between gap-2",
              "text-2xl leading-none font-bold",
            )}
          >
            <p>{format(today, "dd/MM/yyyy")}</p>
            <p>{format(today, "HH:mm:ss")}</p>
          </div>
          <div
            className={clsx(
              "space-y-1 text-center font-mono text-sm leading-none font-light",
            )}
          >
            <p>Les frigos de Paris</p>
            <p>19 Rue des Frigos</p>
            <p>75013 Paris</p>
          </div>
        </div>
      </div>

      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("flex flex-col gap-0.5")}>
        <div
          className={clsx(
            "flex w-full items-center justify-center gap-2 text-center text-xl font-bold uppercase underline decoration-black",
          )}
        >
          Items
        </div>
      </div>
      <div
        className={clsx(
          "flex flex-col gap-2",
          "text-2xl leading-none font-bold",
        )}
      >
        {lineItems.map((row, index) => (
          <div
            key={`${index}-${row.label}`}
            className={clsx("flex items-baseline gap-3")}
          >
            <p className="shrink-0">{row.qty}</p>
            <p className="min-w-0 flex-1 wrap-break-word">{row.label}</p>
            <p className="shrink-0 font-mono text-sm font-light tabular-nums">
              {row.price}
            </p>
          </div>
        ))}
        <div className={clsx("mt-1 border border-dashed border-black")} />
        <div className={clsx("mt-1 flex items-baseline justify-between gap-3")}>
          <p className="tracking-wide uppercase">Total</p>
          <p className="shrink-0 tabular-nums">{totalPrice}</p>
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("grid grid-cols-3 items-center gap-4")}>
        <NinetyNineStudLogo className={clsx("h-10", "justify-self-start")} />
        <div
          className={clsx(
            "flex w-full items-center justify-center gap-2 text-center text-xl",
          )}
        >
          <FramerLogo className={clsx("h-10 w-auto", "justify-self-end")} />
        </div>
        <div
          className={clsx(
            "flex w-full items-center justify-end gap-2 text-center text-xl",
          )}
        >
          <DitherBoothLogotypeMark
            className={clsx("h-10", "justify-self-center")}
          />
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <FramerEventQR className={clsx("h-[150px]")} />
      <div className={clsx("text-center text-2xl leading-none font-bold")}>
        ✦ Thanks for attending this Framer event! ✦
      </div>
      <div
        className={clsx(
          "flex w-full items-center justify-center gap-2 text-center font-mono text-sm font-light",
        )}
      >
        <span>{ticketNumber}</span>
      </div>
    </div>
  );
};

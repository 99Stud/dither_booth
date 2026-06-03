import type { FC } from "react";

import clsx from "clsx";
import { format } from "date-fns";
import { useMemo } from "react";

import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index.tsx";
import { DitherBoothLogotypeMark } from "#components/svg/DitherBoothLogotypeMark/index.tsx";
import { Nexus2026ClassicQR } from "#components/svg/Nexus2026ClassicQR/index.tsx";
import { NexusClassicLogo } from "#components/svg/NexusClassicLogo/index.tsx";
import { NexusKey } from "#components/svg/NexusKey/index.tsx";
import { formatBoothTicketNumber } from "#lib/ticket-ref.ts";
import { cn, mmToPx } from "#lib/utils.ts";

const RECEIPT_TOTAL_EUR = 1999;

const formatReceiptEuro = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    amount,
  );

/** Random positive amounts (cent precision) that sum to `totalEur`. */
const randomPartitionEur = (totalEur: number, parts: number): number[] => {
  const totalCents = Math.round(totalEur * 100);
  if (parts <= 0) return [];
  if (parts === 1) return [totalEur];
  if (totalCents < parts) {
    const each = totalEur / parts;
    return Array.from({ length: parts }, () => each);
  }
  const cuts = new Set<number>();
  while (cuts.size < parts - 1) {
    cuts.add(Math.floor(Math.random() * (totalCents - 1)) + 1);
  }
  const sorted = [0, ...Array.from(cuts).sort((a, b) => a - b), totalCents];
  const amounts: number[] = [];
  for (let i = 0; i < parts; i++) {
    amounts.push((sorted[i + 1]! - sorted[i]!) / 100);
  }
  return amounts;
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
            { qty: "1x" as const, label: "99Stud" },
            { qty: "1x" as const, label: "El Tony Mate" },
            { qty: "1x" as const, label: "Ginette" },
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
      <NexusClassicLogo className={clsx("z-10", "w-2/3", "mx-auto -mb-6")} />
      <div className={clsx("relative w-full overflow-visible bg-white")}>
        <div className={clsx("relative aspect-square w-full overflow-visible")}>
          <img
            id="booth-photo"
            className={clsx(
              "relative z-0 h-full w-full [mask-image:url(../../public/ressources/SVG_dither_booth_mask.svg)] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat] object-cover",
            )}
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
          <NexusKey className={clsx("h-10 w-auto", "justify-self-end")} />
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
      <Nexus2026ClassicQR className={clsx("h-[150px]")} />
      <div className={clsx("text-center text-2xl leading-none font-bold")}>
        ✦ Thanks for partying with us! ✦
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

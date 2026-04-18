import type { FC } from "react";
import { useMemo } from "react";

import { RECEIPT_BOOTH_OVERLAY_LOGO_IMG } from "#components/misc/Receipt/internal/Receipt.booth-logos.ts";
import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index.tsx";
import { NinetyNineStudQR } from "#components/svg/99studQR/index.tsx";
import { DitherBoothLogotypeMark } from "#components/svg/DitherBoothLogotypeMark/index.tsx";
import { ElectroniquesLogo } from "#components/svg/ElectroniquesLogo/index.tsx";
import { ElTonyMateLogo } from "#components/svg/ElTonyMateLogo/index.tsx";
import { TartinesLogo } from "#components/svg/TartinesLogo/index.tsx";
import { formatBoothTicketNumber } from "#lib/ticket-ref.ts";
import { cn, mmToPx } from "#lib/utils.ts";
import clsx from "clsx";
import { format } from "date-fns";

const RECEIPT_TOTAL_EUR = 1999;

const formatReceiptEuro = (amount: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);

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
    if (ticketRef && /^\d{6}$/.test(ticketRef)) return formatBoothTicketNumber(ticketRef);
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
        "py-[40px]",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <div className={clsx("relative mb-12 w-full overflow-visible bg-white ")}>
        <div className={clsx("relative aspect-square w-full overflow-visible")}>
          <img
            id="booth-photo"
            className={clsx("relative z-0 h-full w-full object-cover")}
            src="https://picsum.photos/200"
            alt="booth photo"
          />
          <div
            className={clsx(
              "pointer-events-none absolute top-0 left-0 z-10",
              "origin-top-left -translate-x-[-2%] translate-y-[-36%]",
            )}
          >
            <TartinesLogo
              className={clsx(
                RECEIPT_BOOTH_OVERLAY_LOGO_IMG,
                "max-w-[min(55%,18rem)] object-top-left",
              )}
            />
          </div>
          <div
            className={clsx(
              "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-[40px] justify-center px-2",
            )}
          >
            <ElectroniquesLogo
              className={clsx(RECEIPT_BOOTH_OVERLAY_LOGO_IMG, "w-full object-bottom")}
            />
          </div>
        </div>
      </div>
      <div className={clsx("flex items-center justify-between")}>
        <div className={clsx("flex flex-col gap-2 w-full")}>
          <div
            className={clsx(
              "flex items-center justify-between gap-2 w-full",
              "text-2xl leading-none font-bold",
            )}
          >
            <p>{format(today, "dd/MM/yyyy")}</p>
            <p>{format(today, "HH:mm:ss")}</p>
          </div>
          <div className={clsx("text-sm leading-none font-light text-center font-mono")}>
            <p>Épicerie de Ginette</p>
            <p>24 Cr Albert Thomas</p>
            <p>69008 Lyon</p>
          </div>
        </div>
      </div>

      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("flex flex-col gap-0.5")}>
        <div
          className={clsx(
            "flex items-center justify-center gap-2 w-full text-xl text-center font-bold uppercase underline decoration-black",
          )}
        >
          Items
        </div>
      </div>
      <div className={clsx("flex flex-col gap-2", "text-2xl leading-none font-bold")}>
        {lineItems.map((row, index) => (
          <div key={`${index}-${row.label}`} className={clsx("flex items-baseline gap-3")}>
            <p className="shrink-0">{row.qty}</p>
            <p className="min-w-0 flex-1 wrap-break-word">{row.label}</p>
            <p className="shrink-0 tabular-nums font-mono text-sm font-light">{row.price}</p>
          </div>
        ))}
        <div className={clsx("border border-dashed border-black")} />
        <div className={clsx("flex items-baseline justify-between gap-3")}>
          <p className="uppercase tracking-wide">Total</p>
          <p className="shrink-0 tabular-nums">{totalPrice}</p>
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("grid grid-cols-3 items-center gap-4")}>
        <NinetyNineStudLogo className={clsx("h-10", "justify-self-start")} />
        <div className={clsx("flex items-center justify-center gap-2 w-full text-xl text-center")}>
          <DitherBoothLogotypeMark className={clsx("h-10 w-auto", "justify-self-end")} />
        </div>
        <div className={clsx("flex items-center justify-end gap-2 w-full text-xl text-center")}>
          <ElTonyMateLogo className={clsx("h-15", "justify-self-center")} />
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <NinetyNineStudQR className={clsx("h-[150px]")} />
      <div className={clsx("text-2xl font-bold leading-none text-center")}>
        ✦ Thanks for partying with us! ✦
      </div>
      <div
        className={clsx(
          "flex items-center justify-center gap-2 w-full font-mono text-sm font-light text-center",
        )}
      >
        <span>{ticketNumber}</span>
      </div>
    </div>
  );
};

import clsx from "clsx";
import { format } from "date-fns";
import { useMemo, type FC } from "react";

import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index.tsx";
import { NinetyNineStudQR } from "#components/svg/99studQR/index.tsx";
import { DitherBoothLogotypeMark } from "#components/svg/DitherBoothLogotypeMark/index.tsx";
import { HeirveyLogo } from "#components/svg/HeirveyLogo/index.tsx";
import { NexusKey } from "#components/svg/NexusKey/index.tsx";
import { formatBoothTicketNumber } from "#lib/ticket-ref.ts";
import { cn, mmToPx } from "#lib/utils.ts";

interface HeirveyReceiptProps {
  className?: string;
  names?: string[];
  ticketRef?: string;
}

export const HeirveyReceipt: FC<HeirveyReceiptProps> = (props) => {
  const { className, names: _, ticketRef } = props;

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

  const lineItems = [
    { qty: "1x" as const, label: "99Stud", price: 100 },
    { qty: "1x" as const, label: "El Tony Mate", price: 100 },
    { qty: "1x" as const, label: "Ginette", price: 100 },
  ];

  return (
    <div
      id="receipt"
      data-receipt-ready="true"
      className={cn(
        "flex flex-col gap-4",
        "bg-white text-black",
        "[&_svg]:text-black",
        "font-bit leading-none",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <HeirveyLogo className="mx-auto" />
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
          <p className="shrink-0 tabular-nums">
            {lineItems.reduce((acc, row) => acc + Number(row.price), 0)}€
          </p>
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
          <DitherBoothLogotypeMark
            className={clsx("h-10 w-auto", "justify-self-end")}
          />
        </div>
        <div
          className={clsx(
            "flex w-full items-center justify-end gap-2 text-center text-xl",
          )}
        >
          <NexusKey className={clsx("h-10", "justify-self-center")} />
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <NinetyNineStudQR className={clsx("h-[150px]")} />
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

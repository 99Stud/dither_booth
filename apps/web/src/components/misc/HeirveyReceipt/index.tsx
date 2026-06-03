import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { useMemo, type FC } from "react";

import { HeirveyLogo } from "#components/svg/HeirveyLogo/index.tsx";
import { Nexus2026HeirveyQR } from "#components/svg/Nexus2026HeirveyQR/index.tsx";
import { formatBoothTicketNumber } from "#lib/ticket-ref.ts";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { cn, mmToPx } from "#lib/utils.ts";

const euroReceiptFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const formatReceiptEuro = (amount: number) =>
  euroReceiptFormatter.format(amount);

interface HeirveyReceiptProps {
  className?: string;
  names?: string[];
  ticketRef?: string;
}

export const HeirveyReceipt: FC<HeirveyReceiptProps> = (props) => {
  const { className, names: _, ticketRef } = props;

  const trpc = useTRPC();
  const {
    data: items,
    isLoading,
    isError,
  } = useQuery(trpc.getItems.queryOptions());

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

  const lineItems = useMemo(() => {
    if (isError || !items) return [];
    return items.reduce<Array<{ qty: number; label: string; price: number }>>(
      (items, item) => {
        if (item.qty === 0) return items;

        items.push({
          qty: item.qty,
          label: item.label,
          price: item.price,
        });

        return items;
      },
      [],
    );
  }, [isError, items]);

  const receiptReady = !isLoading;

  const totalPrice = lineItems.reduce((acc, row) => acc + Number(row.price), 0);

  return (
    <div
      id="receipt"
      {...(receiptReady ? { "data-receipt-ready": "true" } : {})}
      className={cn(
        "flex flex-col gap-4",
        "bg-white text-black",
        "[&_svg]:text-black",
        "font-bit leading-none",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <HeirveyLogo className="mx-auto -my-16" />
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
        {lineItems.map((row, index) =>
          row.qty >= 1 ? (
            <div
              key={`${index}-${row.label}`}
              className={clsx("flex items-baseline gap-3")}
            >
              <p className="shrink-0">{row.qty}x</p>
              <p className="min-w-0 flex-1 wrap-break-word">{row.label}</p>
              <p className="shrink-0 font-mono text-sm font-light tabular-nums">
                {formatReceiptEuro(row.price)}
              </p>
            </div>
          ) : null,
        )}
        <div className={clsx("mt-1 border border-dashed border-black")} />
        <div className={clsx("mt-1 flex items-baseline justify-between gap-3")}>
          <p className="tracking-wide uppercase">Total</p>
          <p className="shrink-0 tabular-nums">
            {formatReceiptEuro(totalPrice)}
          </p>
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <Nexus2026HeirveyQR className={clsx("h-[150px]")} />
      <div className={clsx("text-center text-2xl leading-none font-bold")}>
        ✦ From Heirvey with love ✦
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

import type { Rarity } from "@dither-booth/shared/lottery";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";
import { type FC, useMemo } from "react";

import { getRarityReveal } from "#app/Experience/internal/lottery-reveal.utils";
import { LoserMark } from "#components/svg/LoserMark/index";
import { WinnerMark } from "#components/svg/WinnerMark/index";
import { receiptViewerRoute } from "#lib/router/index";
import { formatBoothTicketNumber } from "#lib/ticket-ref";

const formatWonAtDisplay = (iso: string): string | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
};

const RARITY_UI: Record<
  Rarity,
  {
    label: string;
    tier: string;
  }
> = {
  common: { label: "Commun", tier: "T1" },
  uncommon: { label: "Peu commun", tier: "T2" },
  rare: { label: "Rare", tier: "T3" },
  epic: { label: "Épique", tier: "T4" },
  legendary: { label: "Légendaire", tier: "T5" },
};

const LotteryRarityStrip: FC<{ lotRarity: string }> = (props) => {
  const { lotRarity } = props;
  const knownRarity = RARITY_UI[lotRarity as Rarity];
  const cfg = knownRarity ?? {
    label: lotRarity.replace(/_/g, " "),
    tier: "?",
  };
  const RarityIcon = knownRarity
    ? getRarityReveal(lotRarity as Rarity).Icon
    : null;

  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden rounded-sm border-2 border-black px-3 py-2.5",
        "bg-white font-mono tracking-[0.2em] text-black uppercase",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)",
        }}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tabular-nums opacity-80">
          {cfg.tier}
        </span>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
          <span className="text-[12px] tracking-[0.35em] opacity-70">
            Rareté
          </span>
          <span className="truncate text-[15px] font-bold tracking-[0.12em]">
            {cfg.label}
          </span>
        </div>
        {RarityIcon ? (
          <RarityIcon
            className="size-5 shrink-0 stroke-[2.5]"
            aria-hidden
          />
        ) : (
          <span className="text-sm leading-none" aria-hidden>
            ◇
          </span>
        )}
      </div>
    </div>
  );
};

export const LotteryReceiptTemplate: FC<{ className?: string }> = (props) => {
  const { className } = props;
  const {
    outcome: outcomeParam,
    title,
    winInstruction,
    lotRarity,
    wonAt,
    ticketRef,
  } = receiptViewerRoute.useSearch();

  const outcome = outcomeParam === "win" ? "win" : "loss";
  const instructionsLine = outcome === "win" ? winInstruction : undefined;
  const wonAtDisplay = wonAt ? formatWonAtDisplay(wonAt) : null;

  const ticketNumber = useMemo(() => {
    if (ticketRef && /^\d{6}$/.test(ticketRef)) {
      return formatBoothTicketNumber(ticketRef);
    }
    return formatBoothTicketNumber(
      Math.floor(Math.random() * 1_000_000)
        .toString()
        .padStart(6, "0"),
    );
  }, [ticketRef]);

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      data-ticket-ready="true"
      className={cn(
        "flex flex-col items-center gap-4",
        "bg-white text-black",
        "font-bit leading-none",
        "px-[20px] py-[40px]",
        className,
      )}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <div className={clsx("w-full border border-dashed border-black")} />

      {outcome === "win" ? (
        <>
          <div className="flex w-full flex-col items-center gap-1 px-1">
            <WinnerMark className="h-auto max-h-22 w-full max-w-full" />
          </div>
          {title ? (
            <div
              className={clsx("text-center text-3xl leading-tight font-bold")}
            >
              {title}
            </div>
          ) : null}
          {lotRarity ? <LotteryRarityStrip lotRarity={lotRarity} /> : null}
          {instructionsLine ? (
            <div
              className={clsx(
                "mt-1 text-center font-mono text-base whitespace-pre-wrap",
              )}
            >
              {instructionsLine}
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-3 px-1">
          <LoserMark className="h-auto max-h-22 w-full max-w-full" />
        </div>
      )}

      <div className={clsx("w-full border border-dashed border-black")} />

      <div className={clsx("flex flex-col items-center gap-1")}>
        <div className={clsx("text-center text-xl font-bold uppercase")}>
          {ticketNumber}
        </div>
        {outcome === "win" && wonAtDisplay ? (
          <div
            className={clsx(
              "text-center font-mono text-sm leading-snug text-black/80 tabular-nums",
            )}
          >
            {wonAtDisplay}
          </div>
        ) : null}
      </div>
    </div>
  );
};

import { type FC, useMemo } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import type { Rarity } from "@dither-booth/shared/lottery";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

import { LoserMark } from "#components/svg/LoserMark/index";
import { WinnerMark } from "#components/svg/WinnerMark/index";
import { receiptViewerRoute } from "#lib/router/index";
import { formatBoothTicketNumber } from "#lib/ticket-ref";

const WIN_INSTRUCTIONS_LINE = "Présentez ce ticket au bar";

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
    className: string;
    accent: string;
  }
> = {
  common: {
    label: "Commun",
    tier: "T1",
    className:
      "border-stone-400/90 bg-stone-100/90 text-stone-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
    accent: "●",
  },
  uncommon: {
    label: "Peu commun",
    tier: "T2",
    className:
      "border-emerald-500/70 bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    accent: "◆",
  },
  rare: {
    label: "Rare",
    tier: "T3",
    className:
      "border-sky-500/80 bg-gradient-to-br from-sky-100/90 to-cyan-50 text-sky-950 shadow-[0_0_28px_rgba(14,165,233,0.35)] ring-1 ring-sky-300/60",
    accent: "✦",
  },
  epic: {
    label: "Épique",
    tier: "T4",
    className:
      "border-violet-500/80 bg-gradient-to-br from-violet-100/90 to-fuchsia-50 text-violet-950 shadow-[0_0_30px_rgba(139,92,246,0.4)] ring-1 ring-violet-300/60",
    accent: "✧",
  },
  legendary: {
    label: "Légendaire",
    tier: "T5",
    className:
      "border-amber-400 bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-200 text-amber-950 shadow-[0_0_32px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.5)] ring-2 ring-amber-300/70",
    accent: "✶",
  },
};

const LotteryRarityStrip: FC<{ lotRarity: string }> = (props) => {
  const { lotRarity } = props;
  const cfg = RARITY_UI[lotRarity as Rarity] ?? {
    label: lotRarity.replace(/_/g, " "),
    tier: "?",
    className: "border-zinc-400 bg-zinc-100 text-zinc-900 shadow-inner",
    accent: "◇",
  };

  return (
    <div
      className={clsx(
        "relative w-full overflow-hidden rounded-sm border-2 px-3 py-2.5",
        "font-mono uppercase tracking-[0.2em]",
        cfg.className,
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
        <span className="text-sm tabular-nums leading-none" aria-hidden>
          {cfg.accent}
        </span>
      </div>
    </div>
  );
};

export const LotteryReceiptTemplate: FC<{ className?: string }> = (props) => {
  const { className } = props;
  const {
    outcome: outcomeParam,
    lotLabel,
    lotRarity,
    wonAt,
    ticketRef,
  } = receiptViewerRoute.useSearch();

  const outcome = outcomeParam === "win" ? "win" : "loss";
  const instructionsLine =
    outcome === "win" ? WIN_INSTRUCTIONS_LINE : undefined;
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
          {lotLabel ? (
            <div
              className={clsx("text-center text-3xl font-bold leading-tight")}
            >
              {lotLabel}
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
              "text-center font-mono text-sm leading-snug tabular-nums text-black/80",
            )}
          >
            {wonAtDisplay}
          </div>
        ) : null}
      </div>
    </div>
  );
};

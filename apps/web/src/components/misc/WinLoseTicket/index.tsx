import type { FC } from "react";

import { LoserMark } from "#components/svg/LoserMark/index.tsx";
import { WinnerMark } from "#components/svg/WinnerMark/index.tsx";
import { cn, mmToPx } from "#lib/utils.ts";
import clsx from "clsx";

const RARITY_UI: Record<
  string,
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
  medium: {
    label: "Peu commun",
    tier: "T2",
    className:
      "border-sky-500/70 bg-gradient-to-br from-sky-50 to-cyan-50 text-sky-950 shadow-[0_0_24px_rgba(14,165,233,0.2)]",
    accent: "◆",
  },
  rare: {
    label: "Rare",
    tier: "T3",
    className:
      "border-violet-500/80 bg-gradient-to-br from-violet-100/90 to-fuchsia-50 text-violet-950 shadow-[0_0_28px_rgba(139,92,246,0.35)] ring-1 ring-violet-300/60",
    accent: "✦",
  },
  very_rare: {
    label: "Très rare",
    tier: "T4",
    className:
      "border-amber-400 bg-gradient-to-br from-amber-100 via-yellow-50 to-amber-200 text-amber-950 shadow-[0_0_32px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.5)] ring-2 ring-amber-300/70",
    accent: "✶",
  },
};

const LotteryRarityStrip: FC<{ lotRarity: string }> = (props) => {
  const { lotRarity } = props;
  const cfg = RARITY_UI[lotRarity] ?? {
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
        <span className="text-[10px] font-bold tabular-nums opacity-80">{cfg.tier}</span>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
          <span className="text-[9px] tracking-[0.35em] opacity-70">Rareté</span>
          <span className="truncate text-xs font-bold tracking-[0.12em]">{cfg.label}</span>
        </div>
        <span className="text-sm tabular-nums leading-none" aria-hidden>
          {cfg.accent}
        </span>
      </div>
    </div>
  );
};

export const WinLoseTicket: FC<{
  className?: string;
  outcome: "win" | "loss";
  lotLabel?: string | null;
  lotRarity?: string | null;
  description?: string | null;
  instructionsLine?: string;
  ticketReady?: boolean;
}> = (props) => {
  const {
    className,
    outcome,
    lotLabel,
    lotRarity,
    description,
    instructionsLine,
    ticketReady,
  } = props;

  const ready = ticketReady ?? true;

  return (
    <div
      id="lottery-ticket"
      data-ticket-ready={ready ? "true" : undefined}
      className={cn(
        "flex flex-col items-center gap-4",
        "bg-white text-black",
        "font-bit leading-none",
        "py-[40px] px-[20px]",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <div className={clsx("w-full border border-dashed border-black")} />

      {outcome === "win" ? (
        <>
          <div className="flex w-full flex-col items-center gap-1 px-1">
            <WinnerMark className="h-auto w-full max-w-full max-h-22" />
          </div>
          {lotLabel ? (
            <div className={clsx("text-2xl font-bold text-center leading-tight")}>{lotLabel}</div>
          ) : null}
          {lotRarity ? <LotteryRarityStrip lotRarity={lotRarity} /> : null}
          {description ? (
            <div
              className={clsx(
                "w-full px-1 text-center text-sm font-normal leading-snug whitespace-pre-wrap",
              )}
            >
              {description}
            </div>
          ) : null}
          {instructionsLine ? (
            <div
              className={clsx("mt-1 text-center font-mono text-base whitespace-pre-wrap")}
            >
              {instructionsLine}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex w-full flex-col items-center gap-3 px-1">
            <LoserMark className="h-auto w-full max-w-full max-h-22" />
          </div>
        </>
      )}

      <div className={clsx("w-full border border-dashed border-black")} />

      <div className={clsx("text-center font-bold text-xl uppercase")}>
        {`LOTTERY_${Math.floor(Math.random() * 1000000)
          .toString()
          .padStart(6, "0")}`}
      </div>
    </div>
  );
};

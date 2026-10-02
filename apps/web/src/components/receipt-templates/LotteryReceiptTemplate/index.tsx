import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { BOOTH_TICKET_NUMBER_PREFIX } from "@dither-booth/shared/formatting";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";
import { Angry, Smile } from "pixelarticons/react";
import { Eye } from "pixelarticons/react/Eye.js";

import { getRarityReveal } from "#app/Experience/internal/lottery-reveal.utils";
import { receiptViewerRoute } from "#lib/router/index";

const LOSS_HEADLINE = "";
const LOSS_JOKE = "Spam won't help, sorry mate!";
const TICKET_PREFIX_LABEL = BOOTH_TICKET_NUMBER_PREFIX.slice(0, -1);

const formatWonAtParts = (
  iso: string,
): { date: string; time: string } | null => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: date.toLocaleDateString("fr-FR"),
    time: date.toLocaleTimeString("fr-FR"),
  };
};

const AsteriskRule: FC = () => {
  return (
    <span
      aria-hidden
      className="w-full overflow-hidden text-4xl leading-none font-bold whitespace-nowrap italic"
    >
      {"*".repeat(55)}
    </span>
  );
};

const OutcomeBand: FC<{
  outcome: "win" | "loss";
  prizeRarity?: Rarity | null;
}> = (props) => {
  const { outcome, prizeRarity } = props;
  const win = outcome === "win";
  const RarityIcon =
    win && prizeRarity ? getRarityReveal(prizeRarity).Icon : null;
  const Icon = RarityIcon ?? (win ? Smile : Angry);

  return (
    <div className="-mx-5 flex items-center justify-between bg-black px-5 py-4 text-white">
      <span className="font-mono text-6xl leading-none font-black tracking-[0.18em] italic">
        {win ? "WINNER!" : "LOSER!"}
      </span>
      <Icon className="size-16 shrink-0" aria-hidden />
    </div>
  );
};

export const LotteryReceiptTemplate: FC<{ className?: string }> = (props) => {
  const { className } = props;
  const {
    outcome: outcomeParam,
    title,
    winInstruction,
    prizeRarity,
    wonAt,
    ticketRef,
  } = receiptViewerRoute.useSearch();

  const outcome = outcomeParam === "win" ? "win" : "loss";
  const win = outcome === "win";
  const rarityReveal = prizeRarity ? getRarityReveal(prizeRarity) : null;
  const RarityIcon = rarityReveal?.Icon ?? null;
  const wonAtParts = wonAt ? formatWonAtParts(wonAt) : null;
  const headline = win ? title : LOSS_HEADLINE;
  const notice = win ? winInstruction : LOSS_JOKE;

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      data-ticket-ready="true"
      className={cn(
        "flex flex-col gap-8",
        "bg-white px-5 pt-0 pb-10 text-black",
        "font-bit leading-none",
        className,
      )}
      style={{
        WebkitFontSmoothing: "none",
        width: PRINT_WIDTH_PX,
      }}
    >
      <OutcomeBand outcome={outcome} prizeRarity={prizeRarity} />
      {headline ? (
        <p className="text-center text-6xl leading-[0.85] font-bold uppercase">
          {headline}
        </p>
      ) : null}
      {notice ? (
        <div
          className={clsx(
            "flex items-center justify-center gap-4",
            "border-4 border-black px-4 py-5",
            "text-5xl leading-[0.9] font-bold",
          )}
        >
          {win ? null : <Eye className="size-10 shrink-0" aria-hidden />}
          <p className="text-center whitespace-pre-wrap">{notice}</p>
          {win ? null : <Eye className="size-10 shrink-0" aria-hidden />}
        </div>
      ) : null}
      <AsteriskRule />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          {ticketRef ? (
            <span className="text-xl font-bold tracking-[0.12em]">
              {TICKET_PREFIX_LABEL}
            </span>
          ) : (
            <span />
          )}
          {win && rarityReveal ? (
            <span className="inline-flex items-center gap-1.5 text-2xl leading-none font-bold uppercase">
              {RarityIcon ? (
                <RarityIcon className="block size-[1em] shrink-0" aria-hidden />
              ) : null}
              <span className="leading-none">{rarityReveal.label}</span>
            </span>
          ) : wonAtParts ? (
            <span className="text-right text-2xl leading-[0.9] font-bold tabular-nums">
              {wonAtParts.date}
            </span>
          ) : null}
        </div>
        <div className="flex items-end justify-between gap-4">
          {ticketRef ? (
            <span className="text-5xl font-bold tabular-nums">{ticketRef}</span>
          ) : (
            <span />
          )}
          {wonAtParts ? (
            <div className="text-right text-2xl leading-[0.9] font-bold tabular-nums">
              {win && rarityReveal ? <p>{wonAtParts.date}</p> : null}
              <p>{wonAtParts.time}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

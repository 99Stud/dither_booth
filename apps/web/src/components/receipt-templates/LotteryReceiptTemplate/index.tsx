import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { BOOTH_TICKET_NUMBER_PREFIX } from "@dither-booth/shared/formatting";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";
import { Angry } from "pixelarticons/react";
import { Crown } from "pixelarticons/react/Crown.js";
import { Eye } from "pixelarticons/react/Eye.js";

import { getRarityReveal } from "#app/Experience/internal/lottery-reveal.utils";
import { receiptViewerRoute } from "#lib/router/index";

const LOSS_HEADLINE = "";
const LOSS_JOKE = "Spam won't help, sorry mate!";
const TICKET_PREFIX_LABEL = BOOTH_TICKET_NUMBER_PREFIX.slice(0, -1);

const RARITY_UI: Record<Rarity, { label: string }> = {
  common: { label: "Commun" },
  uncommon: { label: "Peu commun" },
  rare: { label: "Rare" },
  epic: { label: "Épique" },
  legendary: { label: "Légendaire" },
};

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

const OutcomeBand: FC<{ outcome: "win" | "loss" }> = (props) => {
  const { outcome } = props;
  const win = outcome === "win";
  const Icon = win ? Crown : Angry;

  return (
    <div className="-mx-5 flex items-center justify-between bg-black px-5 py-4 text-white">
      <span className="text-6xl leading-none font-bold tracking-[0.18em]">
        {win ? "WIN!" : "LOSE!"}
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
  const rarity = prizeRarity ? RARITY_UI[prizeRarity] : null;
  const RarityIcon = prizeRarity ? getRarityReveal(prizeRarity).Icon : null;
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
      <OutcomeBand outcome={outcome} />

      {win && rarity ? (
        <div className="flex items-center justify-start gap-4">
          {RarityIcon ? (
            <RarityIcon className="size-8 shrink-0" aria-hidden />
          ) : null}
          <span className="font-bit text-4xl leading-[0.9] font-bold tracking-[0.16em] text-black uppercase">
            {rarity.label}
          </span>
        </div>
      ) : null}
      {headline ? (
        <p className="text-5xl leading-[0.85] font-bold uppercase">
          {headline}
        </p>
      ) : null}
      {notice ? (
        <div
          className={clsx(
            "flex items-center justify-center gap-4",
            "border-4 border-black px-4 py-5",
            "text-3xl leading-[0.9] font-bold",
          )}
        >
          {win ? null : <Eye className="size-10 shrink-0" aria-hidden />}
          <p className="text-center whitespace-pre-wrap">{notice}</p>
          {win ? null : <Eye className="size-10 shrink-0" aria-hidden />}
        </div>
      ) : null}
      <AsteriskRule />
      <div className="flex items-end justify-between gap-4">
        {ticketRef ? (
          <div className="flex flex-col gap-2">
            <span className="text-xl font-bold tracking-[0.12em]">
              {TICKET_PREFIX_LABEL}
            </span>
            <span className="text-5xl font-bold tabular-nums">{ticketRef}</span>
          </div>
        ) : (
          <span />
        )}
        {wonAtParts ? (
          <div className="text-right text-2xl leading-[0.9] font-bold tabular-nums">
            <p>{wonAtParts.date}</p>
            <p>{wonAtParts.time}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

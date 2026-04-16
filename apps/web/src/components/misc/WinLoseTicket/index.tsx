import type { FC } from "react";

import { cn, mmToPx } from "#lib/utils.ts";
import clsx from "clsx";

interface WinLoseTicketProps {
  className?: string;
  outcome: "win" | "loss";
  lotLabel?: string | null;
  lotRarity?: string | null;
}

const RARITY_LABELS: Record<string, string> = {
  common: "Commun",
  medium: "Medium",
  rare: "Rare",
  very_rare: "Très Rare",
};

export const WinLoseTicket: FC<WinLoseTicketProps> = (props) => {
  const { className, outcome, lotLabel, lotRarity } = props;

  return (
    <div
      id="lottery-ticket"
      className={cn(
        "flex flex-col items-center gap-4",
        "bg-white text-black",
        "font-bit leading-none",
        "py-[40px] px-[20px]",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <div className={clsx("border border-dashed border-black w-full")} />

      {outcome === "win" ? (
        <>
          <div
            className={clsx(
              "text-4xl font-bold text-center uppercase tracking-wider",
            )}
          >
            GAGNÉ !
          </div>
          <div className={clsx("text-2xl font-bold text-center")}>
            {lotLabel}
          </div>
          {lotRarity && (
            <div
              className={clsx(
                "text-sm font-mono text-center uppercase tracking-widest",
              )}
            >
              {RARITY_LABELS[lotRarity] ?? lotRarity}
            </div>
          )}
          <div className={clsx("text-base text-center font-mono mt-2")}>
            Présentez ce ticket au bar
          </div>
        </>
      ) : (
        <>
          <div
            className={clsx(
              "text-3xl font-bold text-center uppercase tracking-wider",
            )}
          >
            Pas cette fois...
          </div>
          <div className={clsx("text-base text-center font-mono")}>
            Retentez votre chance !
          </div>
        </>
      )}

      <div className={clsx("border border-dashed border-black w-full")} />

      <div
        className={clsx(
          "text-xs font-mono text-center text-gray-500 uppercase",
        )}
      >
        {`LOTTERY_${Math.floor(Math.random() * 1000000)
          .toString()
          .padStart(6, "0")}`}
      </div>
    </div>
  );
};

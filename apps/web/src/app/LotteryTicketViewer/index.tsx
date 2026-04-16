import { WinLoseTicket } from "#components/misc/WinLoseTicket/index.tsx";
import { useQueryState } from "nuqs";
import type { FC } from "react";

export const LotteryTicketViewer: FC = () => {
  const [outcome] = useQueryState("outcome");
  const [lotLabel] = useQueryState("lotLabel");
  const [lotRarity] = useQueryState("lotRarity");

  const resolvedOutcome: "win" | "loss" =
    outcome === "win" ? "win" : "loss";

  return (
    <div className="min-h-dvh bg-zinc-100 p-3 text-black">
      <WinLoseTicket
        className="mx-auto"
        outcome={resolvedOutcome}
        lotLabel={lotLabel}
        lotRarity={lotRarity}
      />
    </div>
  );
};

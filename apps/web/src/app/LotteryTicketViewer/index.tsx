import { WinLoseTicket } from "#components/misc/WinLoseTicket/index.tsx";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { type FC, useMemo } from "react";

export const LotteryTicketViewer: FC = () => {
  const trpc = useTRPC();
  const [outcome] = useQueryState("outcome");
  const [lotIdRaw] = useQueryState("lotId");
  const [lotLabel] = useQueryState("lotLabel");
  const [lotRarity] = useQueryState("lotRarity");
  const [wonAt] = useQueryState("wonAt");
  const [ticketRef] = useQueryState("ticketRef", parseAsString);

  const resolvedOutcome: "win" | "loss" = outcome === "win" ? "win" : "loss";

  const lotteryTicketRef =
    ticketRef && /^\d{6}$/.test(ticketRef) ? ticketRef : undefined;

  const lotId = useMemo(() => {
    if (!lotIdRaw) return null;
    const n = Number.parseInt(lotIdRaw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [lotIdRaw]);

  const lotQuery = useQuery({
    ...trpc.getLotteryLotForTicket.queryOptions({ id: lotId! }),
    enabled: resolvedOutcome === "win" && lotId !== null,
  });

  const ticketReady =
    resolvedOutcome === "loss" ||
    (resolvedOutcome === "win" && (lotId === null ? true : lotQuery.isFetched));

  const displayLabel =
    resolvedOutcome === "win" && lotId !== null
      ? lotQuery.data?.label ?? lotLabel ?? null
      : lotLabel;

  const displayRarity =
    resolvedOutcome === "win" && lotId !== null
      ? lotQuery.data?.rarity ?? lotRarity ?? null
      : lotRarity;

  const displayDescription =
    resolvedOutcome === "win" &&
    lotId !== null &&
    lotQuery.data?.description?.trim()
      ? lotQuery.data.description.trim()
      : null;

  const instructionsLine =
    resolvedOutcome === "win"
      ? lotId === null
        ? "Présentez ce ticket au bar"
        : lotQuery.data
          ? lotQuery.data.instructions?.trim() || "Présentez ce ticket au bar"
          : "Présentez ce ticket au bar"
      : undefined;

  return (
    <div className="min-h-dvh bg-zinc-100 p-3 text-black">
      <WinLoseTicket
        className="mx-auto"
        outcome={resolvedOutcome}
        lotLabel={displayLabel}
        lotRarity={displayRarity}
        description={displayDescription}
        wonAtIso={resolvedOutcome === "win" ? wonAt : null}
        instructionsLine={instructionsLine}
        ticketRef={lotteryTicketRef}
        ticketReady={ticketReady}
      />
    </div>
  );
};

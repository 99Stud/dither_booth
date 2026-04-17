import { API_REPO_ROOT } from "#lib/constants.ts";
import { getWebOrigin } from "@dither-booth/ports";

export function buildLotteryTicketViewerUrl(params: {
  outcome: "win" | "loss";
  /** Preferred for wins: server loads label, rarity, description, instructions. */
  lotId?: number | null;
  /** Fallback when `lotId` is not set (legacy URLs). */
  lotLabel?: string | null;
  lotRarity?: string | null;
}): string {
  const webOrigin = getWebOrigin({ repoRoot: API_REPO_ROOT });
  const url = new URL("/lottery-ticket-viewer", webOrigin);
  url.searchParams.set("outcome", params.outcome);
  if (params.outcome === "win") {
    if (params.lotId != null) {
      url.searchParams.set("lotId", String(params.lotId));
    } else {
      if (params.lotLabel) url.searchParams.set("lotLabel", params.lotLabel);
      if (params.lotRarity) url.searchParams.set("lotRarity", params.lotRarity);
    }
  }
  return url.toString();
}

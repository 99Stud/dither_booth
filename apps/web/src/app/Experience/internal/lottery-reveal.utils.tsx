import type { Rarity } from "@dither-booth/shared/lottery";
import { CircleIcon, DiamondIcon, StarIcon, type LucideIcon } from "lucide-react";

export const getRarityReveal = (
  rarity: Rarity,
): { label: string; Icon: LucideIcon } => {
  switch (rarity) {
    case "common":
      return { label: "common", Icon: CircleIcon };
    case "uncommon":
      return { label: "uncommon", Icon: CircleIcon };
    case "rare":
      return { label: "rare", Icon: DiamondIcon };
    case "epic":
      return { label: "epic", Icon: DiamondIcon };
    case "legendary":
      return { label: "legendary", Icon: StarIcon };
  }
};

export const formatLastWinAt = (
  lastWinAt: string | null,
  nowMs: number = Date.now(),
): string => {
  if (!lastWinAt) return "no wins yet";

  const winMs = Date.parse(lastWinAt);
  if (Number.isNaN(winMs)) return "no wins yet";

  const elapsedMs = Math.max(0, nowMs - winMs);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);

  if (elapsedSeconds < 60) return "last win: just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `last win: ${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `last win: ${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `last win: ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
};

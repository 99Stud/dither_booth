import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import { Badge } from "@dither-booth/ui/components/ui/badge";

/** Game-style rarity colours, readable in both themes. */
const RARITY_CLASS_NAMES = {
  common: "bg-muted text-muted-foreground",
  uncommon:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  rare: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  epic: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
  legendary:
    "bg-amber-500/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
} as const satisfies Record<Rarity, string>;

/** `count` prefixes the label ("19 Common") for stock summaries. */
export const RarityBadge: FC<{ rarity: Rarity; count?: number }> = ({
  rarity,
  count,
}) => (
  <Badge className={RARITY_CLASS_NAMES[rarity]} variant="secondary">
    {count !== undefined && (
      <span className="font-semibold tabular-nums">{count}</span>
    )}
    {capitalize(rarity)}
  </Badge>
);

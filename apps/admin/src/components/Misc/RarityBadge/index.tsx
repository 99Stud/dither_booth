import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import { Badge } from "@dither-booth/ui/components/ui/badge";

/** The rarity's colour (a CSS variable from globals.css), for marks. */
export const rarityColor = (rarity: Rarity) => `var(--rarity-${rarity})`;

/** A coloured dot for a rarity, next to a neutral label. */
export const RarityDot: FC<{ rarity: Rarity; className?: string }> = ({
  rarity,
  className,
}) => (
  <span
    aria-hidden
    className={className ?? "size-2 shrink-0 rounded-full"}
    style={{ backgroundColor: rarityColor(rarity) }}
  />
);

/** `count` prefixes the label ("19 Common") for stock summaries. */
export const RarityBadge: FC<{ rarity: Rarity; count?: number }> = ({
  rarity,
  count,
}) => (
  <Badge variant="outline" className="gap-1.5">
    <RarityDot rarity={rarity} />
    {count !== undefined && (
      <span className="font-semibold tabular-nums">{count}</span>
    )}
    {capitalize(rarity)}
  </Badge>
);

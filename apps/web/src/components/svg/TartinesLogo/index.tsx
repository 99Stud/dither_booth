import type { FC } from "react";

import { cn } from "#lib/utils.ts";

export const TartinesLogo: FC<{ className?: string }> = (props) => {
  const { className } = props;
  return (
    <img
      src="/public/ressources/tartines-logo.svg"
      alt="Tartines"
      draggable={false}
      className={cn("pointer-events-none select-none", className)}
    />
  );
};

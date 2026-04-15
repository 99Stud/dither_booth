import type { FC } from "react";

import { cn } from "#lib/utils.ts";

export const ElectroniquesLogo: FC<{ className?: string }> = (props) => {
  const { className } = props;
  return (
    <img
      src="/public/ressources/electroniques-logo.svg"
      alt="Électroniques"
      draggable={false}
      className={cn("pointer-events-none select-none", className)}
    />
  );
};

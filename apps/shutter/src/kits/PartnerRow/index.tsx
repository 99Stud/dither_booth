import type { FC, ReactNode } from "react";

import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

import { usePartnerLogos } from "#kits/kitPartners";

interface PartnerRowProps {
  className?: string;
  /** Printed under the row, only when the row is printed. */
  separator?: ReactNode;
}

/**
 * The event's partner logos in equal boxes across the ticket, in order.
 * Nothing at all when the event has none.
 */
export const PartnerRow: FC<PartnerRowProps> = (props) => {
  const { className, separator } = props;
  const logos = usePartnerLogos();

  if (logos.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "flex w-full items-center justify-evenly gap-4",
          className,
        )}
      >
        {logos.map((logo) => (
          <div
            key={logo.id}
            className={clsx("flex h-18 min-w-0 flex-1 justify-center")}
          >
            <img
              src={logo.src}
              alt=""
              decoding="sync"
              className={clsx(
                "h-full max-w-full object-contain",
                "[image-rendering:pixelated]",
              )}
            />
          </div>
        ))}
      </div>
      {separator}
    </>
  );
};

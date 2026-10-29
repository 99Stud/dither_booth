import type { CSSProperties, FC } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

import { BalDesVampiresLogo } from "#components/svg/BalDesVampiresLogo/index";
import { HalloweenTicketBody } from "#kits/halloween-2026/HalloweenTicketBody/index";

import photoMaskPath from "./photo-mask.png";

interface HalloweenPhotoTicketProps {
  className?: string;
}

// Through a variable: Bun's CSS bundler can't resolve a `url()` written in a
// class, the JS import gives the bundled asset's path.
const PHOTO_MASK_STYLE = {
  "--photo-mask": `url(${photoMaskPath})`,
} as CSSProperties;

/**
 * The Bal des Vampires logo over the photo, cut out by a brush-stroke mask.
 * The mask is 576×576 like the photo and 1-bit, so the printed edge keeps its
 * grain.
 */
export const HalloweenPhotoTicket: FC<HalloweenPhotoTicketProps> = (props) => {
  const { className } = props;

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      className={cn(
        "pt-12",
        "bg-background",
        "font-bit text-5xl leading-none",
        className,
      )}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <div className={clsx("relative")}>
        <BalDesVampiresLogo
          className={clsx("relative z-10", "mx-auto w-[90%]")}
        />
        <img
          id="booth-photo"
          className={clsx(
            "-mt-12",
            "w-full",
            "aspect-square",
            "[image-rendering:pixelated]",
            "mask-(--photo-mask) mask-size-[100%_100%] mask-no-repeat",
          )}
          style={PHOTO_MASK_STYLE}
          src="https://picsum.photos/576"
          alt="booth photo"
        />
      </div>
      <HalloweenTicketBody />
    </div>
  );
};

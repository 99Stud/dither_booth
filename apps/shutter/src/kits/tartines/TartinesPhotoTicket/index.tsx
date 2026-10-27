import type { FC } from "react";

import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import clsx from "clsx";

import { ElectroniqueLogo } from "#components/svg/ElectroniqueLogo/index";
import { TartinesLogo } from "#components/svg/TartinesLogo/index";
import { TartinesTicketBody } from "#kits/tartines/TartinesTicketBody/index";

interface TartinesPhotoTicketProps {
  className?: string;
}

export const TartinesPhotoTicket: FC<TartinesPhotoTicketProps> = (props) => {
  const { className } = props;

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      className={cn(
        "pt-16",
        "bg-background",
        "font-bit text-5xl leading-none",
        className,
      )}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <div className={clsx("relative", "mb-18")}>
        <TartinesLogo className={clsx("absolute -top-16 left-4", "h-40")} />
        <ElectroniqueLogo
          className={clsx("absolute -bottom-18 left-4", "h-36")}
        />
        <img
          id="booth-photo"
          className={clsx(
            "w-full",
            "aspect-square",
            "[image-rendering:pixelated]",
          )}
          src="https://picsum.photos/576"
          alt="booth photo"
        />
      </div>
      <TartinesTicketBody />
    </div>
  );
};

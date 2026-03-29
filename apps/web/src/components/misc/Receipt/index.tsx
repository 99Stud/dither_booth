import type { FC } from "react";

import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index.tsx";
import { DitherBoothLogo } from "#components/svg/DitherBoothLogo/index.tsx";
import { ElTonyMateLogo } from "#components/svg/ElTonyMateLogo/index.tsx";
import { cn, mmToPx } from "#lib/utils.ts";
import clsx from "clsx";
import { format } from "date-fns";

interface ReceiptProps {
  className?: string;
}

export const Receipt: FC<ReceiptProps> = ({ className }) => {
  return (
    <div
      id="receipt"
      className={cn("flex flex-col gap-4", "bg-background", className)}
      style={{ width: mmToPx(80) + "px" }}
    >
      <img
        id="booth-photo"
        className={clsx("w-full", "aspect-square")}
        src="https://picsum.photos/200"
        alt="booth photo"
      />
      <div
        className={clsx(
          "flex items-center justify-between gap-2",
          "text-2xl font-semibold",
        )}
      >
        <p>{format(new Date(), "HH:mm")}</p>
        <p>Épicerie de Ginette</p>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("flex flex-col gap-1", "text-xl font-medium")}>
        <div className={clsx("flex items-center gap-4")}>
          <p>1x</p>
          <p>99STUD X EL TONY MATE</p>
        </div>
        <div className={clsx("flex items-center gap-4")}>
          <p>1x</p>
          <p>HEIRVEY</p>
        </div>
      </div>
      <div className={clsx("border border-dashed border-black")} />
      <div className={clsx("grid grid-cols-3 items-center gap-4")}>
        <NinetyNineStudLogo className={clsx("h-10", "justify-self-start")} />
        <ElTonyMateLogo className={clsx("h-10", "justify-self-center")} />
        <DitherBoothLogo className={clsx("h-6", "justify-self-end")} />
      </div>
    </div>
  );
};

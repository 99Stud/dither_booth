import type { FC } from "react";

import { NinetyNineStudLogo } from "#components/svg/99StudLogo/index";
import { NinetyNineStudQR } from "#components/svg/99studQR/index";
import { DitherBoothLogo } from "#components/svg/DitherBoothLogo/index";
import { ElTonyMateLogo } from "#components/svg/ElTonyMateLogo/index";
import { cn, mmToPx } from "#lib/utils";
import clsx from "clsx";
import { format } from "date-fns";

interface ReceiptProps {
  className?: string;
}

export const Receipt: FC<ReceiptProps> = ({ className }) => {
  const today = new Date();

  return (
    <div
      id="receipt"
      className={cn(
        "flex flex-col gap-4",
        "bg-background",
        "font-bit leading-none",
        className,
      )}
      style={{ width: mmToPx(80) + "px" }}
    >
      <img
        id="booth-photo"
        className={clsx("w-full", "aspect-square")}
        src="https://picsum.photos/200"
        alt="booth photo"
      />
      <div className={clsx("flex items-center justify-between")}>
        <div className={clsx("flex flex-col gap-2")}>
          <div
            className={clsx(
              "flex items-center justify-between gap-2",
              "text-2xl leading-none font-semibold",
            )}
          >
            <p>{format(today, "HH:mm")}</p>
            <p>{format(today, "dd/MM/yyyy")}</p>
          </div>
          <div className={clsx("text-2xl leading-none")}>
            <p>Épicerie de Ginette</p>
            <p>24 Cr Albert Thomas</p>
            <p>69008 Lyon</p>
          </div>
        </div>
        <NinetyNineStudQR className={clsx("h-[104px]")} />
      </div>

      <div className={clsx("border border-dashed border-black")} />
      <div
        className={clsx(
          "flex flex-col gap-0.5",
          "text-3xl leading-none font-bold",
        )}
      >
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

import type { FC } from "react";

import { NinetyNineStudLogo } from "@dither-booth/ui/components/svg/99StudLogo/index";
import { NinetyNineStudQR } from "@dither-booth/ui/components/svg/99studQR/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import { ElTonyMateLogo } from "@dither-booth/ui/components/svg/ElTonyMateLogo/index";
import { formatPrice } from "@dither-booth/ui/lib/formatting";
import clsx from "clsx";
import { format } from "date-fns";

import { ElectroniqueLogo } from "#components/svg/ElectroniqueLogo/index";
import { TartinesLogo } from "#components/svg/TartinesLogo/index";
import { PRINT_WIDTH_PX } from "#lib/constants";
import { RECEIPT_ID } from "#lib/receipt-templates/receipt-templates.constants";
import { cn } from "#lib/utils";
interface TartinesReceiptTemplateProps {
  className?: string;
}

export const TartinesReceiptTemplate: FC<TartinesReceiptTemplateProps> = ({
  className,
}) => {
  const today = new Date();

  return (
    <div
      id={RECEIPT_ID}
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
          className={clsx("w-full", "aspect-square")}
          src="https://picsum.photos/576"
          alt="booth photo"
        />
      </div>
      <div className={clsx("pt-16", "flex flex-col gap-12")}>
        <div
          className={clsx(
            "flex items-center justify-between",
            "leading-[0.7] font-bold",
          )}
        >
          <p>{format(today, "dd/MM/yyyy")}</p>
          <p>{format(today, "HH:mm:ss")}</p>
        </div>
        <div
          className={clsx(
            "flex flex-col items-center",
            "font-mono text-3xl font-light",
          )}
        >
          <p>Épicerie de Ginette</p>
          <p>24 Cr Albert Thomas</p>
          <p>69008 Lyon</p>
        </div>
      </div>
      <DashedLine />
      <div className={clsx("flex flex-col gap-10")}>
        <p className={clsx("text-center leading-[0.7] font-bold underline")}>
          ITEMS
        </p>
        <div className={clsx("flex flex-col gap-4", "font-bold")}>
          <ReceiptItem
            quantity={1}
            name="99stud 99stud 99stud 99stud 99stud"
            price={10}
          />
          <ReceiptItem quantity={1} name="El Tony Mate" price={10} />
        </div>
      </div>
      <DashedLine className={clsx("mb-6")} />
      <div className={clsx("flex items-center justify-between")}>
        <p className={clsx("mt-1 leading-[0.7] font-bold")}>TOTAL</p>
        <p className={clsx("font-mono text-3xl font-medium tabular-nums")}>
          {formatPrice(20)}
        </p>
      </div>
      <DashedLine className={clsx("mt-6")} />
      <div className={clsx("grid grid-cols-3 items-center gap-4")}>
        <NinetyNineStudLogo className={clsx("h-20", "justify-self-start")} />
        <DitherBoothLogo className={clsx("h-14", "justify-self-center")} />
        <ElTonyMateLogo className={clsx("h-20", "justify-self-end")} />
      </div>
      <DashedLine />
      <NinetyNineStudQR className={clsx("mx-auto mb-8", "w-1/2")} />
      <p className={clsx("mb-4 text-center font-bold")}>
        ✦ Thanks for partying with us! ✦
      </p>
      <p className={clsx("text-center text-3xl")}>STUD_DITHERBOOTH_611856</p>
    </div>
  );
};

interface ReceiptItemProps {
  quantity: number;
  name: string;
  price: number;
}
const ReceiptItem: FC<ReceiptItemProps> = ({ quantity, name, price }) => {
  return (
    <div className={clsx("flex items-center justify-between gap-12")}>
      <div className={clsx("flex min-w-0 flex-1 items-center gap-4")}>
        <p
          className={clsx(
            "shrink-0 font-mono text-3xl font-medium tabular-nums",
          )}
        >
          {quantity}x
        </p>
        <p className={clsx("mt-1 min-w-0 truncate leading-[0.7]")}>{name}</p>
      </div>
      <p
        className={clsx("shrink-0 font-mono text-3xl font-light tabular-nums")}
      >
        {formatPrice(price)}
      </p>
    </div>
  );
};

type DashedLineProps = {
  className?: string;
};

const DashedLine: FC<DashedLineProps> = ({ className }) => {
  return (
    <div
      className={cn("my-12", "border-2 border-dashed border-black", className)}
    />
  );
};

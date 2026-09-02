import { RECEIPT_ELEMENT_ID } from "@dither-booth/shared/browser/receipt-viewer";
import { formatPrice } from "@dither-booth/shared/formatting";
import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";
import { NinetyNineStudLogo } from "@dither-booth/ui/components/svg/99StudLogo/index";
import { DitherBoothLogo } from "@dither-booth/ui/components/svg/DitherBoothLogo/index";
import clsx from "clsx";
import { format } from "date-fns";
import { type FC, useMemo } from "react";

import { pickWeightedReceiptItems } from "./items";

const TARTINES_RECEIPT_TOTAL = 1999;
const TARTINES_RECEIPT_ITEM_COUNT = 3;

const randomPriceSplit = (total: number): [number, number, number] => {
  const minPrice = 1;
  let remainder = total - 3 * minPrice;

  const firstExtra = Math.floor(Math.random() * (remainder + 1));
  remainder -= firstExtra;

  const secondExtra = Math.floor(Math.random() * (remainder + 1));
  remainder -= secondExtra;

  return [minPrice + firstExtra, minPrice + secondExtra, minPrice + remainder];
};

interface TartinesReceiptTemplateProps {
  className?: string;
}

export const TartinesReceiptTemplate: FC<TartinesReceiptTemplateProps> = ({
  className,
}) => {
  const today = new Date();
  const items = useMemo(() => {
    const prices = randomPriceSplit(TARTINES_RECEIPT_TOTAL);

    return pickWeightedReceiptItems(TARTINES_RECEIPT_ITEM_COUNT).map(
      (item, index) => ({
        name: item.name,
        quantity: item.quantity ?? 1,
        price: prices[index] ?? 0,
      }),
    );
  }, []);

  return (
    <div
      id={RECEIPT_ELEMENT_ID}
      className={cn(
        "bg-background",
        "font-bit text-5xl leading-none",
        className,
      )}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <div className={clsx("relative")}>
        <p
          className={clsx(
            "absolute top-3 left-3",
            "font-helvetica-black-italic text-7xl font-bold",
          )}
        >
          OPENING
        </p>
        <p
          className={clsx(
            "absolute right-5 bottom-3",
            "font-helvetica-black-italic text-7xl font-bold",
          )}
        >
          PARTY
        </p>
        <img
          id="booth-photo"
          className={clsx("w-full", "aspect-square")}
          src="https://picsum.photos/576"
          alt="booth photo"
        />
      </div>
      <div className={clsx("pt-10", "flex flex-col gap-12")}>
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
          <p>10 Rue du Gazomètre</p>
          <p>69003 Lyon</p>
        </div>
      </div>
      <DashedLine />
      <div className={clsx("flex flex-col gap-10")}>
        <p className={clsx("text-center leading-[0.7] font-bold underline")}>
          ITEMS
        </p>
        <div className={clsx("flex flex-col gap-4", "font-bold")}>
          {items.map((item) => (
            <ReceiptItem
              key={item.name}
              quantity={item.quantity}
              name={item.name}
              price={item.price}
            />
          ))}
        </div>
      </div>
      <DashedLine className={clsx("mb-6")} />
      <div className={clsx("flex items-center justify-between")}>
        <p className={clsx("mt-1 leading-[0.7] font-bold")}>TOTAL</p>
        <p className={clsx("font-mono text-3xl font-medium tabular-nums")}>
          {formatPrice(TARTINES_RECEIPT_TOTAL)}
        </p>
      </div>
      <DashedLine className={clsx("mt-6")} />
      <div className={clsx("flex items-center justify-evenly gap-4")}>
        <NinetyNineStudLogo className={clsx("h-20")} />
        <DitherBoothLogo className={clsx("h-14")} />
      </div>
      <DashedLine />
      <p className={clsx("mb-4 text-center font-bold")}>
        ✦ Thanks for partying with us! ✦
      </p>
      <p className={clsx("text-center text-3xl")}>99STUD_DITHERBOOTH_611856</p>
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
    <div className={clsx("flex items-start justify-between gap-12")}>
      <div className={clsx("flex min-w-0 flex-1 items-start gap-4")}>
        <p
          className={clsx(
            "shrink-0 font-mono text-3xl font-medium tabular-nums",
          )}
        >
          {quantity}x
        </p>
        <p className={clsx("mt-1 min-w-0 leading-[0.7]")}>{name}</p>
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

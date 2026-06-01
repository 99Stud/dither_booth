import type { FC } from "react";

import { cn, mmToPx } from "#lib/utils.ts";

interface HeirveyReceiptProps {
  className?: string;
}

export const HeirveyReceipt: FC<HeirveyReceiptProps> = (props) => {
  const { className } = props;

  return (
    <div
      id="receipt"
      className={cn("bg-white p-6 text-black", className)}
      style={{ width: mmToPx(80) + "px" }}
    >
      <h1 className="text-center text-2xl font-bold">Heirvey</h1>
    </div>
  );
};

import type { FC } from "react";

import { PRINT_WIDTH_PX } from "@dither-booth/shared/printing";
import { cn } from "@dither-booth/shared/styles";

import { RECEIPT_ID } from "#lib/receipt-templates/receipt-templates.constants";

interface HeirveyReceiptTemplateProps {
  className?: string;
}

export const HeirveyReceiptTemplate: FC<HeirveyReceiptTemplateProps> = ({
  className,
}) => {
  return (
    <div
      id={RECEIPT_ID}
      className={cn("bg-background", "font-bit leading-none", className)}
      style={{ width: PRINT_WIDTH_PX }}
    >
      <h1>Heirvey Receipt Template</h1>
    </div>
  );
};

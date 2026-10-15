import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { Printer, RotateCcw } from "lucide-react";

interface PrintConfigurationActionsProps {
  isPrintReceiptDisabled: boolean;
  isPrintingReceipt: boolean;
  isResetDisabled: boolean;
  onPrintReceipt: () => Promise<void> | void;
  onResetConfiguration: () => Promise<void> | void;
}

export const PrintConfigurationActions: FC<PrintConfigurationActionsProps> = ({
  isPrintReceiptDisabled,
  isPrintingReceipt,
  isResetDisabled,
  onPrintReceipt,
  onResetConfiguration,
}) => {
  return (
    <div className={clsx("flex w-full items-center justify-between gap-2")}>
      <Button
        size="lg"
        variant="ghost"
        disabled={isResetDisabled}
        onClick={() => {
          void onResetConfiguration();
        }}
      >
        <RotateCcw data-icon="inline-start" />
        Reset
      </Button>
      <Button
        size="lg"
        disabled={isPrintReceiptDisabled}
        onClick={() => {
          void onPrintReceipt();
        }}
      >
        {isPrintingReceipt ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Printer data-icon="inline-start" />
        )}
        {isPrintingReceipt ? "Printing…" : "Test print"}
      </Button>
    </div>
  );
};

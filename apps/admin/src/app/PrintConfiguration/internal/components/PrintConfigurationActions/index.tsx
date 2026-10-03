import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";

interface PrintConfigurationActionsProps {
  isAutoTuneDisabled: boolean;
  isAutoTuning: boolean;
  isPrintReceiptDisabled: boolean;
  isPrintingReceipt: boolean;
  isResetDisabled: boolean;
  onAutoTune: () => Promise<void> | void;
  onPrintReceipt: () => Promise<void> | void;
  onResetConfiguration: () => Promise<void> | void;
}

export const PrintConfigurationActions: FC<PrintConfigurationActionsProps> = ({
  isAutoTuneDisabled,
  isAutoTuning,
  isPrintReceiptDisabled,
  isPrintingReceipt,
  isResetDisabled,
  onAutoTune,
  onPrintReceipt,
  onResetConfiguration,
}) => {
  return (
    <div className={clsx("flex flex-col gap-2")}>
      <Button
        variant="outline"
        disabled={isAutoTuneDisabled}
        onClick={() => {
          void onAutoTune();
        }}
      >
        {isAutoTuning ? (
          <>
            Analyzing lighting&nbsp;
            <Spinner className="size-4" />
          </>
        ) : (
          "Auto-tune from camera"
        )}
      </Button>
      <Button
        disabled={isResetDisabled}
        onClick={() => {
          void onResetConfiguration();
        }}
      >
        Reset configuration
      </Button>
      <Button
        disabled={isPrintReceiptDisabled}
        onClick={() => {
          void onPrintReceipt();
        }}
      >
        {isPrintingReceipt ? (
          <>
            Printing receipt&nbsp;
            <Spinner className="size-4" />
          </>
        ) : (
          "Print receipt"
        )}
      </Button>
    </div>
  );
};

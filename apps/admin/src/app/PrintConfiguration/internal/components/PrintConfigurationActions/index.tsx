import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";

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
    <div className={clsx("flex flex-col gap-2")}>
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

import { Button } from "#components/ui/button.tsx";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FC, useCallback, useState } from "react";

import { ADMIN_HEIRVEY_RECEIPT_LOG_SOURCE } from "./internal/AdminHeirveyReceipt.constants.ts";
import { AdminHeirveyReceiptItemsTab } from "./internal/AdminHeirveyReceiptItemsTab.tsx";

export const AdminHeirveyReceipt: FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: items } = useQuery(trpc.getItems.queryOptions());
  const generateHeirveyReceipt = useMutation(
    trpc.generateHeirveyReceipt.mutationOptions(),
  );
  const printReceipt = useMutation(trpc.print.mutationOptions());
  const resetAllItemQuantities = useMutation(
    trpc.resetAllItemQuantities.mutationOptions(),
  );
  const [itemsMutating, setItemsMutating] = useState(false);

  const allQuantitiesZero =
    items !== undefined && items.length > 0 && items.every((item) => item.qty === 0);

  const isBusy =
    generateHeirveyReceipt.isPending ||
    printReceipt.isPending ||
    itemsMutating ||
    resetAllItemQuantities.isPending;

  const handleResetQuantities = useCallback(async () => {
    await resetAllItemQuantities.mutateAsync();
    await queryClient.invalidateQueries(trpc.getItems.queryOptions());
  }, [queryClient, resetAllItemQuantities, trpc]);

  const printHeirvey = async () => {
    try {
      const clientFlowId = crypto.randomUUID();
      const flowStartedAt = performance.now();

      const generateStartedAt = performance.now();
      const screenshot = await generateHeirveyReceipt.mutateAsync({
        clientFlowId,
      });
      const generateHeirveyReceiptMs =
        Math.round((performance.now() - generateStartedAt) * 100) / 100;

      const printStartedAt = performance.now();
      const blob = base64ToBlob(screenshot.data, screenshot.mimeType);
      await printReceipt.mutateAsync(blob);
      const printMs = Math.round((performance.now() - printStartedAt) * 100) / 100;

      logKioskEvent("info", ADMIN_HEIRVEY_RECEIPT_LOG_SOURCE, "admin-heirvey-print-metrics", {
        details: {
          clientFlowId,
          generateHeirveyReceiptMs,
          printMs,
          totalMs: Math.round((performance.now() - flowStartedAt) * 100) / 100,
        },
      });
    } catch (e) {
      reportKioskError(e, {
        event: "admin-heirvey-print-failed",
        source: ADMIN_HEIRVEY_RECEIPT_LOG_SOURCE,
        userMessage: "Failed to print Heirvey receipt.",
      });
    }
  };

  const buttonLabel = generateHeirveyReceipt.isPending
    ? "Generating receipt…"
    : printReceipt.isPending
      ? "Printing…"
      : "Print Heirvey receipt";

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-sm font-semibold tracking-tight">Heirvey receipt admin</h1>
        <Button
          variant="outline"
          size="sm"
          disabled={
            isBusy ||
            (items?.length ?? 0) === 0 ||
            allQuantitiesZero
          }
          onClick={() => void handleResetQuantities()}
        >
          {resetAllItemQuantities.isPending ? "Resetting…" : "Reset quantities"}
        </Button>
      </header>
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 pb-10 sm:px-6 lg:px-8">
        <AdminHeirveyReceiptItemsTab
          disabled={isBusy}
          onMutatingChange={setItemsMutating}
        />
        <div className="flex justify-end border-t border-border pt-6">
          <Button disabled={isBusy} onClick={() => void printHeirvey()}>
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

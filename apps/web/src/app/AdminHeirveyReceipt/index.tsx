import { Button } from "#components/ui/button.tsx";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { useMutation } from "@tanstack/react-query";
import type { FC } from "react";

import { ADMIN_HEIRVEY_RECEIPT_LOG_SOURCE } from "./internal/AdminHeirveyReceipt.constants.ts";

export const AdminHeirveyReceipt: FC = () => {
  const trpc = useTRPC();

  const generateHeirveyReceipt = useMutation(
    trpc.generateHeirveyReceipt.mutationOptions(),
  );
  const printReceipt = useMutation(trpc.print.mutationOptions());

  const isBusy = generateHeirveyReceipt.isPending || printReceipt.isPending;

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
      <header className="border-b px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-sm font-semibold tracking-tight">Heirvey receipt admin</h1>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Button disabled={isBusy} onClick={() => void printHeirvey()}>
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
};

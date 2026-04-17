import type { WebcamHandle } from "#components/misc/Webcam/internal/Webcam.types.ts";

import { Webcam } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, downloadBlob } from "#lib/utils.ts";
import { logKioskEvent } from "@dither-booth/logging";
import { useMutation } from "@tanstack/react-query";
import { type FC, useRef } from "react";

import { ROOT_LOG_SOURCE } from "./internal/Root.constants";

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const trpc = useTRPC();

  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const { isPending: isGeneratingReceipt } = generateReceipt;

  const downloadReceipt = async () => {
    try {
      const clientFlowId = crypto.randomUUID();
      const flowStartedAt = performance.now();

      const squarePhoto = await takeSquarePhoto(ROOT_LOG_SOURCE, async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      });

      if (!squarePhoto) {
        return;
      }

      const photoMs = Math.round((performance.now() - flowStartedAt) * 100) / 100;

      const dataUrlStartedAt = performance.now();
      const photoDataUrl = await blobToDataUrl(squarePhoto);
      const dataUrlMs = Math.round((performance.now() - dataUrlStartedAt) * 100) / 100;

      const receiptStartedAt = performance.now();
      const receipt = await generateReceipt.mutateAsync({
        image: photoDataUrl,
        clientFlowId,
      });
      const generateReceiptMs = Math.round((performance.now() - receiptStartedAt) * 100) / 100;

      logKioskEvent("info", ROOT_LOG_SOURCE, "root-download-receipt-metrics", {
        details: {
          clientFlowId,
          photoMs,
          dataUrlMs,
          generateReceiptMs,
          totalMs: Math.round((performance.now() - flowStartedAt) * 100) / 100,
        },
      });

      const blob = base64ToBlob(receipt.data, receipt.mimeType);

      downloadBlob(blob, "screenshot.webp");
    } catch (e) {
      reportKioskError(e, {
        event: "generate-receipt-failed",
        source: ROOT_LOG_SOURCE,
        userMessage: "Generate receipt failed.",
      });
    }
  };

  return (
    <div className="relative h-dvh bg-black">
      <div className="flex h-full items-center justify-center p-3">
        <Webcam showDebugInfo showPreview ref={webcamRef} className="h-full" />
      </div>
      <div className="fixed top-6 left-6 flex flex-col gap-2">
        <Button disabled={isGeneratingReceipt} onClick={downloadReceipt}>
          {isGeneratingReceipt ? "Generating receipt..." : "Download Receipt"}
        </Button>
      </div>
    </div>
  );
};

import { PrintConfigurationPanel } from "#components/misc/PrintConfigurationPanel/index.tsx";
import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { takeSquarePhoto } from "#lib/image-manipulation/image-manipulation.utils.ts";
import { reportKioskError } from "#lib/logging/logging.utils.ts";
import { ENABLE_PRINT_DEBUG_PANEL } from "#lib/public-env.ts";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils.ts";
import { blobToDataUrl, downloadBlob } from "#lib/utils.ts";
import { useMutation } from "@tanstack/react-query";
import { type FC, useRef, useState } from "react";

import { ROOT_LOG_SOURCE } from "./internal/Root.constants";

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const trpc = useTRPC();

  const [printConfigurationPanelOpen, setPrintConfigurationPanelOpen] =
    useState(false);

  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const { isPending: isGeneratingReceipt } = generateReceipt;

  const takeSquarePhotoAndGetDataUrl = async () => {
    try {
      const squarePhoto = await takeSquarePhoto(ROOT_LOG_SOURCE, async () => {
        if (!webcamRef.current) {
          throw new Error("Camera is not available.");
        }

        return await webcamRef.current.takePhoto();
      });

      return await blobToDataUrl(squarePhoto);
    } catch (e) {
      reportKioskError(e, {
        event: "take-square-photo-and-get-data-url-failed",
        source: ROOT_LOG_SOURCE,
        userMessage: "Take square photo and get data URL failed.",
      });
    }
  };

  const downloadReceipt = async () => {
    try {
      const photoDataUrl = await takeSquarePhotoAndGetDataUrl();

      if (!photoDataUrl) {
        return;
      }

      const screenshot = await generateReceipt.mutateAsync({
        image: photoDataUrl,
      });

      const blob = base64ToBlob(screenshot.data, screenshot.mimeType);

      downloadBlob(blob, "screenshot.webp");
    } catch (e) {
      reportKioskError(e, {
        event: "generate-receipt-failed",
        source: ROOT_LOG_SOURCE,
        userMessage: "Generate receipt failed.",
      });
    }
  };

  const closePrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(false);
  };

  const openPrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(true);
  };

  return (
    <div className="relative h-dvh bg-black">
      <div className="flex h-full items-center justify-center p-4">
        <Webcam ref={webcamRef} className="h-full" />
      </div>
      <div className="fixed top-8 left-8 flex flex-col gap-2">
        <Button disabled={isGeneratingReceipt} onClick={downloadReceipt}>
          {isGeneratingReceipt ? "Generating receipt..." : "Download Receipt"}
        </Button>
        {ENABLE_PRINT_DEBUG_PANEL && (
          <Button variant="outline" onClick={openPrintConfigurationPanel}>
            Open Print Configuration Panel
          </Button>
        )}
      </div>
      {ENABLE_PRINT_DEBUG_PANEL && printConfigurationPanelOpen && (
        <div className="fixed top-8 right-8 z-50">
          <PrintConfigurationPanel
            webcamRef={webcamRef}
            onClose={closePrintConfigurationPanel}
          />
        </div>
      )}
    </div>
  );
};

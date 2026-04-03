import { PrintConfigurationPanel } from "#components/misc/PrintConfigurationPanel/index.tsx";
import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { resizeBlobToSquare } from "#lib/image-manipulation/utils.ts";
import { logKioskEvent, toErrorMessage } from "#lib/logging.ts";
import { ENABLE_PRINT_DEBUG_PANEL } from "#lib/public-env.ts";
import { base64ToBlob } from "#lib/trpc/utils.ts";
import { blobToDataUrl, downloadBlob, getBlobDimensions } from "#lib/utils.ts";
import { trpc } from "#trpc/client.ts";
import { isTRPCClientError } from "#trpc/utils.ts";
import { type FC, useRef, useState } from "react";
import { toast } from "sonner";

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const [printConfigurationPanelOpen, setPrintConfigurationPanelOpen] =
    useState(false);

  const takeSquarePhotoAndGetDataUrl = async () => {
    try {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      const photo = await webcamRef.current.takePhoto();
      const { width, height } = await getBlobDimensions(photo);

      logKioskEvent("info", "web.root", "photo-captured", {
        height,
        width,
      });

      if (width === height) {
        return await blobToDataUrl(photo);
      }

      logKioskEvent("info", "web.root", "client-square-resize-requested");

      const resizedPhoto = await resizeBlobToSquare(photo);

      return await blobToDataUrl(resizedPhoto);
    } catch (e) {
      logKioskEvent(
        "error",
        "web.root",
        "take-square-photo-and-get-data-url-failed",
        {
          error: toErrorMessage(
            e,
            "Take square photo and get data URL failed.",
          ),
        },
      );
    }
  };

  const downloadReceipt = async () => {
    const photoDataUrl = await takeSquarePhotoAndGetDataUrl();

    if (!photoDataUrl) {
      return;
    }

    const screenshot = await trpc.generateReceipt
      .mutate({
        image: photoDataUrl,
      })
      .catch((e) => {
        if (isTRPCClientError(e)) {
          toast.error(e.message);
        }
        logKioskEvent("error", "web.root", "generate-receipt-failed", {
          error: toErrorMessage(e, "Generate receipt failed."),
        });
      });

    if (!screenshot) {
      return;
    }

    const blob = base64ToBlob(screenshot.data, screenshot.mimeType);

    downloadBlob(blob, "screenshot.webp");
  };

  const closePrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(false);
  };

  const openPrintConfigurationPanel = () => {
    setPrintConfigurationPanelOpen(true);
  };

  return (
    <div className="relative min-h-dvh bg-black">
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Webcam ref={webcamRef} />
      </div>
      <div className="fixed top-8 left-8 flex flex-col gap-2">
        <Button onClick={downloadReceipt}>Download Receipt</Button>
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

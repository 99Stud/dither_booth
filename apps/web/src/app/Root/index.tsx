import { WEB_CAMERA_LOG_SOURCE } from "#lib/constants";
import { takeSquarePhotoAndFlipHorizontally } from "#lib/image-manipulation/image-manipulation.utils";
import { reportKioskError } from "#lib/logging/logging.utils";
import { base64ToBlob, useTRPC } from "#lib/trpc/trpc.utils";
import { downloadBlob } from "#lib/utils";
import {
  Webcam,
  type WebcamHandle,
} from "@dither-booth/ui/components/misc/Webcam";
import { Button } from "@dither-booth/ui/components/ui/button";
import { createUserMediaReporters } from "@dither-booth/ui/lib/hooks/user-media";
import { useMutation } from "@tanstack/react-query";
import { type FC, useRef } from "react";

import { ROOT_LOG_SOURCE } from "./internal/Root.constants";

const {
  reportUserMediaCameraStateChange,
  reportUserMediaConstraintFallbackError,
} = createUserMediaReporters({ source: WEB_CAMERA_LOG_SOURCE });

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const trpc = useTRPC();

  const generateReceipt = useMutation(trpc.generateReceipt.mutationOptions());
  const { isPending: isGeneratingReceipt } = generateReceipt;

  const downloadReceipt = async () => {
    try {
      const squarePhoto = await takeSquarePhotoAndFlipHorizontally(
        ROOT_LOG_SOURCE,
        async () => {
          if (!webcamRef.current) {
            throw new Error("Camera is not available.");
          }

          return await webcamRef.current.takePhoto();
        },
      );

      if (!squarePhoto) {
        return;
      }

      const receipt = await generateReceipt.mutateAsync(squarePhoto);

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

  const downloadRawSquarePhoto = async () => {
    try {
      const squarePhoto = await takeSquarePhotoAndFlipHorizontally(
        ROOT_LOG_SOURCE,
        async () => {
          if (!webcamRef.current) {
            throw new Error("Camera is not available.");
          }

          return await webcamRef.current.takePhoto();
        },
      );

      if (!squarePhoto) {
        return;
      }

      downloadBlob(squarePhoto, "raw-square-photo.webp");
    } catch (e) {
      reportKioskError(e, {
        event: "download-raw-square-photo-failed",
        source: ROOT_LOG_SOURCE,
        userMessage: "Download raw square photo failed.",
      });
    }
  };

  return (
    <div className="relative h-dvh bg-black">
      <div className="flex h-full items-center justify-center p-4">
        <Webcam
          showDebugInfo
          showPreview
          ref={webcamRef}
          className="h-full"
          onCameraStateChange={reportUserMediaCameraStateChange}
          onConstraintFallbackError={reportUserMediaConstraintFallbackError}
        />
      </div>
      <div className="fixed top-8 left-8 flex flex-col gap-2">
        <Button disabled={isGeneratingReceipt} onClick={downloadReceipt}>
          {isGeneratingReceipt ? "Generating receipt..." : "Download Receipt"}
        </Button>
        <Button onClick={downloadRawSquarePhoto}>
          Download Raw Square Photo
        </Button>
      </div>
    </div>
  );
};

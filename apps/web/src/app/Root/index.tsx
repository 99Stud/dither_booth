import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
import { logKioskEvent, toErrorMessage } from "#lib/logging.ts";
import { base64ToBlob } from "#lib/trpc/utils.ts";
import { downloadBlob } from "#lib/utils.ts";
import { trpc } from "#trpc/client.ts";
import { isTRPCClientError } from "#trpc/utils.ts";
import { type FC, useRef } from "react";
import { toast } from "sonner";

const getBlobDimensions = async (blob: Blob) => {
  const imageBitmap = await createImageBitmap(blob);

  try {
    return {
      width: imageBitmap.width,
      height: imageBitmap.height,
    };
  } finally {
    imageBitmap.close();
  }
};

export const Root: FC = () => {
  const webcamRef = useRef<WebcamHandle>(null);

  const handleDownload = async () => {
    try {
      if (!webcamRef.current) {
        throw new Error("Camera is not available.");
      }

      const photo = await webcamRef.current.takePhoto();
      const filename = Date.now().toString();
      const { width, height } = await getBlobDimensions(photo);

      logKioskEvent("info", "web.root", "photo-captured", {
        height,
        width,
      });

      if (width === height) {
        downloadBlob(photo, filename);
        return;
      }

      logKioskEvent("info", "web.root", "square-resize-requested");

      const resizedPhoto = await trpc.squareResize.mutate(photo).catch((e) => {
        if (isTRPCClientError(e)) {
          toast.error(e.message);
        }
        logKioskEvent("error", "web.root", "square-resize-failed", {
          error: toErrorMessage(e, "Square resize failed."),
        });
      });

      if (!resizedPhoto) {
        return;
      }

      const squarePhoto = base64ToBlob(
        resizedPhoto.data,
        resizedPhoto.mimeType,
      );

      const { width: resizedWidth, height: resizedHeight } =
        await getBlobDimensions(squarePhoto);
      logKioskEvent("info", "web.root", "photo-resized", {
        height: resizedHeight,
        width: resizedWidth,
      });

      downloadBlob(squarePhoto, filename);
    } catch (e) {
      logKioskEvent("error", "web.root", "download-failed", {
        error: toErrorMessage(e, "Download failed."),
      });
    }
  };

  const handlePrint = async () => {
    await trpc.print.mutate().catch((e) => {
      if (isTRPCClientError(e)) {
        toast.error(e.message);
      }
      logKioskEvent("error", "web.root", "print-failed", {
        error: toErrorMessage(e, "Print failed."),
      });
    });
  };

  return (
    <div className="relative min-h-dvh bg-black">
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Webcam ref={webcamRef} />
      </div>
      <div className="fixed top-8 left-8 flex flex-col gap-2">
        <Button onClick={handlePrint}>Print</Button>
        <Button onClick={handleDownload}>Download</Button>
      </div>
    </div>
  );
};

import { Webcam, type WebcamHandle } from "#components/misc/Webcam/index.tsx";
import { Button } from "#components/ui/button.tsx";
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

      console.log(`Photo original dimensions: ${width}x${height}`);

      if (width === height) {
        downloadBlob(photo, filename);
        return;
      }

      console.log("Resizing photo to square...");

      const resizedPhoto = await trpc.squareResize.mutate(photo).catch((e) => {
        if (isTRPCClientError(e)) {
          toast.error(e.message);
        }
        console.error(e);
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
      console.log(`Resized photo dimensions: ${resizedWidth}x${resizedHeight}`);

      downloadBlob(squarePhoto, filename);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = async () => {
    await trpc.print.mutate().catch((e) => {
      if (isTRPCClientError(e)) {
        toast.error(e.message);
      }
      console.error(e);
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

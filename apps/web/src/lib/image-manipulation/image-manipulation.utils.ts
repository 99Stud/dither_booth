import {
  createOrientedImageBitmap,
  getBlobDimensions,
} from "#lib/utils.ts";
import { logKioskEvent } from "@dither-booth/logging";

const FALLBACK_IMAGE_MIME_TYPE = "image/png";

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });

export const resizeBlobToSquare = async (blob: Blob): Promise<Blob> => {
  if (blob.size === 0) {
    throw new Error("Photo input was empty.");
  }

  const imageBitmap = await createOrientedImageBitmap(blob);

  try {
    const { width, height } = imageBitmap;

    if (width === 0 || height === 0) {
      throw new Error("Could not determine photo dimensions.");
    }

    const side = Math.min(width, height);
    const sourceX = (width - side) / 2;
    const sourceY = (height - side) / 2;
    const canvas = document.createElement("canvas");

    canvas.width = side;
    canvas.height = side;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create canvas context.");
    }

    context.drawImage(
      imageBitmap,
      sourceX,
      sourceY,
      side,
      side,
      0,
      0,
      side,
      side,
    );

    const preferredMimeType = blob.type || FALLBACK_IMAGE_MIME_TYPE;
    const resizedBlob =
      (await canvasToBlob(canvas, preferredMimeType)) ??
      (preferredMimeType === FALLBACK_IMAGE_MIME_TYPE
        ? null
        : await canvasToBlob(canvas, FALLBACK_IMAGE_MIME_TYPE));

    if (!resizedBlob) {
      throw new Error("Failed to encode resized photo.");
    }

    return resizedBlob;
  } finally {
    imageBitmap.close();
  }
};

export const takeSquarePhoto = async (
  source: string,
  takePhoto: () => Promise<Blob>,
) => {
  const photo = await takePhoto();
  const { width, height } = await getBlobDimensions(photo);

  logKioskEvent("info", source, "photo-captured", {
    details: {
      height,
      width,
    },
  });

  if (width !== height) {
    logKioskEvent("info", source, "client-square-resize-requested");
  }

  return await resizeBlobToSquare(photo);
};

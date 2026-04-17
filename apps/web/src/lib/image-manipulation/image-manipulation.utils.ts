import {
  createOrientedImageBitmap,
  getBlobDimensions,
} from "#lib/utils.ts";
import {
  getJpegImageMetadataFromBlob,
  shouldForceManualOrientation,
} from "#lib/image-orientation.utils.ts";
import { logKioskEvent } from "@dither-booth/logging";

const FALLBACK_IMAGE_MIME_TYPE = "image/png";
const MAX_PHOTO_SIDE_PX = 1024;
const JPEG_ENCODE_QUALITY = 0.9;

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });

export const resizeBlobToSquare = async (
  blob: Blob,
  options?: { maxSide?: number },
): Promise<Blob> => {
  if (blob.size === 0) {
    throw new Error("Photo input was empty.");
  }

  const maxSide = options?.maxSide ?? MAX_PHOTO_SIDE_PX;
  const imageBitmap = await createOrientedImageBitmap(blob);

  try {
    const { width, height } = imageBitmap;

    if (width === 0 || height === 0) {
      throw new Error("Could not determine photo dimensions.");
    }

    const sourceSide = Math.min(width, height);
    const sourceX = (width - sourceSide) / 2;
    const sourceY = (height - sourceSide) / 2;
    const targetSide = Math.min(sourceSide, maxSide);
    const canvas = document.createElement("canvas");

    canvas.width = targetSide;
    canvas.height = targetSide;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create canvas context.");
    }

    context.drawImage(
      imageBitmap,
      sourceX,
      sourceY,
      sourceSide,
      sourceSide,
      0,
      0,
      targetSide,
      targetSide,
    );

    // JPEG keeps the payload small for the API upload + dither pipeline.
    const resizedBlob =
      (await canvasToBlob(canvas, "image/jpeg", JPEG_ENCODE_QUALITY)) ??
      (await canvasToBlob(canvas, FALLBACK_IMAGE_MIME_TYPE));

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
  const jpegMetadata = await getJpegImageMetadataFromBlob(photo);
  const { width, height } = await getBlobDimensions(photo);

  logKioskEvent("info", source, "photo-captured", {
    details: {
      exifOrientation: jpegMetadata.orientation,
      height,
      manualOrientationForced: shouldForceManualOrientation(jpegMetadata),
      mimeType: photo.type || "unknown",
      rawHeight: jpegMetadata.height,
      rawWidth: jpegMetadata.width,
      sizeBytes: photo.size,
      width,
    },
  });

  if (width !== height) {
    logKioskEvent("info", source, "client-square-resize-requested");
  }

  const squarePhoto = await resizeBlobToSquare(photo);
  const resizedDimensions = await getBlobDimensions(squarePhoto);

  logKioskEvent("info", source, "photo-square-resized", {
    details: {
      height: resizedDimensions.height,
      mimeType: squarePhoto.type || "unknown",
      sizeBytes: squarePhoto.size,
      width: resizedDimensions.width,
    },
  });

  return squarePhoto;
};

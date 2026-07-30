import {
  getJpegImageMetadataFromBlob,
  manuallyOrientImageBitmap,
  shouldForceManualOrientation,
  shouldManuallyOrientBitmap,
} from "./image-orientation";

const FALLBACK_IMAGE_MIME_TYPE = "image/png";

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });

/** Decodes JPEG EXIF orientation (critical for iOS/iPadOS camera stills). */
export const createOrientedImageBitmap = async (
  blob: Blob,
): Promise<ImageBitmap> => {
  const jpegMetadata = await getJpegImageMetadataFromBlob(blob);

  if (shouldForceManualOrientation(jpegMetadata)) {
    try {
      const rawImageBitmap = await createImageBitmap(blob, {
        imageOrientation: "none",
      });

      try {
        return await manuallyOrientImageBitmap(
          rawImageBitmap,
          jpegMetadata.orientation ?? 1,
        );
      } finally {
        rawImageBitmap.close();
      }
    } catch {
      const imageBitmap = await createImageBitmap(blob);

      if (
        !shouldManuallyOrientBitmap({
          bitmapHeight: imageBitmap.height,
          bitmapWidth: imageBitmap.width,
          jpegMetadata,
        })
      ) {
        return imageBitmap;
      }

      try {
        return await manuallyOrientImageBitmap(
          imageBitmap,
          jpegMetadata.orientation ?? 1,
        );
      } finally {
        imageBitmap.close();
      }
    }
  }

  try {
    const imageBitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });

    if (
      !shouldManuallyOrientBitmap({
        bitmapHeight: imageBitmap.height,
        bitmapWidth: imageBitmap.width,
        jpegMetadata,
      })
    ) {
      return imageBitmap;
    }

    try {
      return await manuallyOrientImageBitmap(
        imageBitmap,
        jpegMetadata.orientation ?? 1,
      );
    } finally {
      imageBitmap.close();
    }
  } catch {
    const imageBitmap = await createImageBitmap(blob);

    if (
      !shouldManuallyOrientBitmap({
        bitmapHeight: imageBitmap.height,
        bitmapWidth: imageBitmap.width,
        jpegMetadata,
      })
    ) {
      return imageBitmap;
    }

    try {
      return await manuallyOrientImageBitmap(
        imageBitmap,
        jpegMetadata.orientation ?? 1,
      );
    } finally {
      imageBitmap.close();
    }
  }
};

export const getBlobDimensions = async (blob: Blob) => {
  const imageBitmap = await createOrientedImageBitmap(blob);

  try {
    return {
      width: imageBitmap.width,
      height: imageBitmap.height,
    };
  } finally {
    imageBitmap.close();
  }
};

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

export const flipBlobHorizontally = async (blob: Blob): Promise<Blob> => {
  const imageBitmap = await createOrientedImageBitmap(blob);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create canvas context.");
    }

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(imageBitmap, 0, 0);

    const flippedBlob = await canvasToBlob(
      canvas,
      blob.type || FALLBACK_IMAGE_MIME_TYPE,
    );

    if (!flippedBlob) {
      throw new Error("Failed to encode flipped photo.");
    }

    return flippedBlob;
  } finally {
    imageBitmap.close();
  }
};

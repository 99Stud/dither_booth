import { logKioskEvent } from "@dither-booth/logging";

const FALLBACK_IMAGE_MIME_TYPE = "image/png";

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });

export const getBlobDimensions = async (blob: Blob) => {
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

export const resizeBlobToSquare = async (blob: Blob): Promise<Blob> => {
  if (blob.size === 0) {
    throw new Error("Photo input was empty.");
  }

  const imageBitmap = await createImageBitmap(blob);

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
  const imageBitmap = await createImageBitmap(blob);

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

export const takeSquarePhotoAndFlipHorizontally = async (
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

  if (width === height) {
    return await flipBlobHorizontally(photo);
  }

  logKioskEvent("info", source, "client-square-resize-requested");

  return await flipBlobHorizontally(await resizeBlobToSquare(photo));
};

export const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as data URL."));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(blob);
  });

import { logKioskEvent } from "@dither-booth/logging";
import {
  flipBlobHorizontally,
  getBlobDimensions,
  resizeBlobToSquare,
} from "@dither-booth/shared/browser/image";

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

  if (width === height) {
    return photo;
  }

  logKioskEvent("info", source, "client-square-resize-requested");

  return await resizeBlobToSquare(photo);
};

/** Match Webcam preview (`-scale-x-100`) so the print matches what the guest saw. */
export const takeSquarePhotoAndFlipHorizontally = async (
  source: string,
  takePhoto: () => Promise<Blob>,
) => {
  const squarePhoto = await takeSquarePhoto(source, takePhoto);
  return await flipBlobHorizontally(squarePhoto);
};

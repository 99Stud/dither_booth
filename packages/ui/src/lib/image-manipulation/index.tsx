import { logKioskEvent } from "@dither-booth/logging";
import {
  flipBlobHorizontally,
  getBlobDimensions,
  resizeBlobToSquare,
} from "@dither-booth/shared/browser/image";

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

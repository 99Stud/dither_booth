import { logKioskEvent } from "@dither-booth/logging";
import {
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

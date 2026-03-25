import { FALLBACK_MIME_TYPE } from "./constants";

export const encodeBase64 = (bytes: Uint8Array) => {
  return Buffer.from(bytes).toString("base64");
};

export const formatToMimeType = (format?: string) => {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "tiff":
      return "image/tiff";
    case "avif":
      return "image/avif";
    default:
      return FALLBACK_MIME_TYPE;
  }
};

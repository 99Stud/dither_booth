export const EXIF_ORIENTATION_SWAP_VALUES = new Set([5, 6, 7, 8]);

export const getJpegImageMetadata = (
  input: ArrayBuffer | Uint8Array,
): {
  height?: number;
  orientation?: number;
  width?: number;
} => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return {};
  }

  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;
  let orientation: number | undefined;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      break;
    }

    const marker = bytes[offset + 1];

    if (marker === undefined || marker === 0xd9 || marker === 0xda) {
      break;
    }

    const segmentLength =
      ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);

    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
      break;
    }

    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + segmentLength;

    if (marker === 0xe1 && orientation === undefined) {
      orientation = readExifOrientation(bytes, segmentStart, segmentEnd);
    }

    if (isStartOfFrameMarker(marker) && width === undefined && height === undefined) {
      height = ((bytes[segmentStart + 1] ?? 0) << 8) | (bytes[segmentStart + 2] ?? 0);
      width = ((bytes[segmentStart + 3] ?? 0) << 8) | (bytes[segmentStart + 4] ?? 0);
    }

    offset = segmentEnd;
  }

  return {
    ...(height !== undefined ? { height } : {}),
    ...(orientation !== undefined ? { orientation } : {}),
    ...(width !== undefined ? { width } : {}),
  };
};

export const getJpegImageMetadataFromBlob = async (blob: Blob) => {
  if (blob.type !== "image/jpeg") {
    return {};
  }

  return getJpegImageMetadata(await blob.arrayBuffer());
};

export const shouldManuallyOrientBitmap = (input: {
  bitmapHeight: number;
  bitmapWidth: number;
  jpegMetadata: {
    height?: number;
    orientation?: number;
    width?: number;
  };
}) => {
  const { bitmapHeight, bitmapWidth, jpegMetadata } = input;
  const { height, orientation, width } = jpegMetadata;

  if (
    orientation === undefined ||
    orientation === 1 ||
    width === undefined ||
    height === undefined
  ) {
    return false;
  }

  if (EXIF_ORIENTATION_SWAP_VALUES.has(orientation)) {
    return bitmapWidth === width && bitmapHeight === height;
  }

  return false;
};

export const manuallyOrientImageBitmap = async (
  imageBitmap: ImageBitmap,
  orientation: number,
) => {
  const canvas = document.createElement("canvas");
  const swapDimensions = EXIF_ORIENTATION_SWAP_VALUES.has(orientation);
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  canvas.width = swapDimensions ? height : width;
  canvas.height = swapDimensions ? width : height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not create canvas context for image orientation.");
  }

  switch (orientation) {
    case 2:
      context.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      context.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      context.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      context.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      context.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      context.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      context.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      break;
  }

  context.drawImage(imageBitmap, 0, 0);

  return await createImageBitmap(canvas);
};

const isStartOfFrameMarker = (marker: number) => {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
};

const readExifOrientation = (
  bytes: Uint8Array,
  segmentStart: number,
  segmentEnd: number,
) => {
  if (segmentEnd - segmentStart < 14) {
    return undefined;
  }

  if (
    bytes[segmentStart] !== 0x45 ||
    bytes[segmentStart + 1] !== 0x78 ||
    bytes[segmentStart + 2] !== 0x69 ||
    bytes[segmentStart + 3] !== 0x66 ||
    bytes[segmentStart + 4] !== 0x00 ||
    bytes[segmentStart + 5] !== 0x00
  ) {
    return undefined;
  }

  const tiffOffset = segmentStart + 6;
  const littleEndian =
    bytes[tiffOffset] === 0x49 && bytes[tiffOffset + 1] === 0x49;
  const bigEndian = bytes[tiffOffset] === 0x4d && bytes[tiffOffset + 1] === 0x4d;

  if (!littleEndian && !bigEndian) {
    return undefined;
  }

  const readUint16 = (offset: number) => {
    if (offset + 1 >= segmentEnd) {
      return undefined;
    }

    return littleEndian
      ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
      : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  };

  const readUint32 = (offset: number) => {
    if (offset + 3 >= segmentEnd) {
      return undefined;
    }

    if (littleEndian) {
      return (
        (bytes[offset] ?? 0) |
        ((bytes[offset + 1] ?? 0) << 8) |
        ((bytes[offset + 2] ?? 0) << 16) |
        ((bytes[offset + 3] ?? 0) << 24)
      );
    }

    return (
      ((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)
    );
  };

  const firstIfdOffset = readUint32(tiffOffset + 4);

  if (firstIfdOffset === undefined) {
    return undefined;
  }

  const ifdStart = tiffOffset + firstIfdOffset;
  const entryCount = readUint16(ifdStart);

  if (entryCount === undefined) {
    return undefined;
  }

  for (let index = 0; index < entryCount; index++) {
    const entryOffset = ifdStart + 2 + index * 12;
    const tag = readUint16(entryOffset);
    const type = readUint16(entryOffset + 2);
    const count = readUint32(entryOffset + 4);

    if (tag !== 0x0112 || type !== 3 || count !== 1) {
      continue;
    }

    return readUint16(entryOffset + 8);
  }

  return undefined;
};

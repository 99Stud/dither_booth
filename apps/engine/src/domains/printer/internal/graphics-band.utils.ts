import { GRAPHICS_BAND_HEIGHT_DOTS } from "./printer.constants";

const GS_V_0_HEADER_SIZE = 8;
/** GS 8 L parameter bytes counted in p1..p4 before the image data. */
const GS_8_L_PARAMETER_SIZE = 10;

/** ESC $ 0 0: start each band at the left margin. */
const ABSOLUTE_POSITION_ZERO = Buffer.from([0x1b, 0x24, 0x00, 0x00]);
/** GS ( L fn 50: print the graphics buffer. */
const PRINT_GRAPHICS_BUFFER = Buffer.from([
  0x1d, 0x28, 0x4c, 0x02, 0x00, 0x30, 0x32,
]);

/**
 * Re-encodes a GS v 0 raster as the band sequence Epson's macOS filter sends:
 * for each band, ESC $ 0 0, GS 8 L fn 112 (store a monochrome raster at 1x1
 * scale), the band rows, then GS ( L fn 50 (print it).
 */
export const gsV0ToGraphicsBands = (
  command: Buffer,
  bandHeight = GRAPHICS_BAND_HEIGHT_DOTS,
): Buffer => {
  if (
    command.length < GS_V_0_HEADER_SIZE ||
    command[0] !== 0x1d ||
    command[1] !== 0x76 ||
    command[2] !== 0x30
  ) {
    throw new Error("Invalid GS v 0 raster command header.");
  }

  const widthBytes = command.readUInt16LE(4);
  const height = command.readUInt16LE(6);
  const widthDots = widthBytes * 8;
  const parts: Buffer[] = [];

  for (let top = 0; top < height; top += bandHeight) {
    const rows = Math.min(bandHeight, height - top);
    const dataStart = GS_V_0_HEADER_SIZE + top * widthBytes;
    const data = command.subarray(dataStart, dataStart + rows * widthBytes);
    const header = Buffer.alloc(17);

    header.set([0x1d, 0x38, 0x4c]); // GS 8 L
    header.writeUInt32LE(data.length + GS_8_L_PARAMETER_SIZE, 3);
    header.set([0x30, 0x70, 0x30, 0x01, 0x01, 0x31], 7); // m fn a bx by c
    header.writeUInt16LE(widthDots, 13);
    header.writeUInt16LE(rows, 15);

    parts.push(ABSOLUTE_POSITION_ZERO, header, data, PRINT_GRAPHICS_BUFFER);
  }

  return Buffer.concat(parts);
};

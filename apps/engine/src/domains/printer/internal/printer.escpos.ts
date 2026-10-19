import { gsV0ToGraphicsBands } from "./graphics-band.utils";
import {
  PRINT_RASTER_IN_GRAPHICS_BANDS,
  PRINTER_INITIALIZE_COMMAND,
} from "./printer.constants";

/** GS a 0xFF: push a status packet now and on every change (ASB). */
export const GS_A_ON = Buffer.from([0x1d, 0x61, 0xff]);
/** GS a 0: stop the automatic status packets. */
export const GS_A_OFF = Buffer.from([0x1d, 0x61, 0x00]);
/**
 * DLE DC4 fn 8: clear the receive and print buffers. A real-time command, so
 * it reaches the printer even when an aborted GS v 0 is still waiting for
 * image bytes, which would otherwise swallow the next job as picture data.
 */
export const DLE_DC4_CLEAR_BUFFERS = Buffer.from([
  0x10, 0x14, 0x08, 0x01, 0x03, 0x14, 0x01, 0x06, 0x02, 0x08,
]);

/** ESC a 1: centre the raster. */
const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
/** Two line feeds after the image, then three more and a full cut (GS V 0). */
const FEED_AND_CUT = Buffer.from([
  0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00,
]);

/**
 * One receipt as the bytes the printer gets. `ESC @` resets the printer,
 * Automatic Status Back included, so the watch switches it back on straight
 * after; without it the printer stays silent until the next reconnect.
 */
export const frameRasterJob = (
  raster: Buffer,
  { asb }: { asb: boolean },
): Buffer =>
  Buffer.concat([
    PRINTER_INITIALIZE_COMMAND,
    ...(asb ? [GS_A_ON] : []),
    ALIGN_CENTER,
    PRINT_RASTER_IN_GRAPHICS_BANDS ? gsV0ToGraphicsBands(raster) : raster,
    FEED_AND_CUT,
  ]);

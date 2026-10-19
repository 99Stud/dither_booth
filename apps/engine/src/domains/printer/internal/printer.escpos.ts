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

/** What a job carries: a GS v 0 raster, or ESC/POS text and QR commands. */
export type PrintJobContent = "raster" | "escpos";

/**
 * One job as the bytes the printer gets. `ESC @` resets the printer,
 * Automatic Status Back included, so the watch switches it back on straight
 * after; without it the printer stays silent until the next reconnect.
 */
export const framePrintJob = (
  body: Buffer,
  { asb, content = "raster" }: { asb: boolean; content?: PrintJobContent },
): Buffer =>
  Buffer.concat([
    PRINTER_INITIALIZE_COMMAND,
    ...(asb ? [GS_A_ON] : []),
    ALIGN_CENTER,
    content === "raster" && PRINT_RASTER_IN_GRAPHICS_BANDS
      ? gsV0ToGraphicsBands(body)
      : body,
    FEED_AND_CUT,
  ]);

/** One line of a text ticket, printed centred. */
export type TicketLine =
  | { kind: "title"; text: string }
  | { kind: "text"; text: string }
  | { kind: "small"; text: string }
  | { kind: "qr"; data: string }
  | { kind: "gap" };

const LF = 0x0a;
/** GS ! 0x11: double width and height. GS ! 0: back to normal. */
const DOUBLE_SIZE_ON = Buffer.from([0x1d, 0x21, 0x11]);
const DOUBLE_SIZE_OFF = Buffer.from([0x1d, 0x21, 0x00]);
/** ESC E 1 / ESC E 0: bold. */
const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
/** ESC M 1 / ESC M 0: the smaller font B. */
const FONT_B = Buffer.from([0x1b, 0x4d, 0x01]);
const FONT_A = Buffer.from([0x1b, 0x4d, 0x00]);
/** Dots per QR module: ~8 gives a code a phone reads from arm's length. */
const QR_MODULE_SIZE = 8;
/** GS ( k stores at most 7089 bytes of QR data. */
const QR_MAX_DATA_BYTES = 7089;

/**
 * The printer's default code page is plain ASCII on its lower half: accents
 * are dropped and anything else becomes `?`, rather than printing garbage.
 */
const toPrinterText = (text: string) =>
  Buffer.from(
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "?"),
    "latin1",
  );

/** GS ( k, model 2: select the model, module size and error correction M, store, print. */
const qrCommand = (data: string) => {
  const bytes = Buffer.from(data, "utf8");

  if (bytes.length > QR_MAX_DATA_BYTES) {
    throw new Error(
      `QR data is ${bytes.length} bytes; the printer takes ${QR_MAX_DATA_BYTES}.`,
    );
  }

  const storeLength = bytes.length + 3;

  return Buffer.concat([
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, QR_MODULE_SIZE]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([
      0x1d,
      0x28,
      0x6b,
      storeLength & 0xff,
      storeLength >> 8,
      0x31,
      0x50,
      0x30,
    ]),
    bytes,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
  ]);
};

/** A text ticket as ESC/POS: the printer draws the text and the QR codes itself. */
export const buildTextTicket = (lines: TicketLine[]): Buffer =>
  Buffer.concat(
    lines.map((line) => {
      switch (line.kind) {
        case "title":
          return Buffer.concat([
            BOLD_ON,
            DOUBLE_SIZE_ON,
            toPrinterText(line.text),
            Buffer.from([LF]),
            DOUBLE_SIZE_OFF,
            BOLD_OFF,
          ]);
        case "text":
          return Buffer.concat([toPrinterText(line.text), Buffer.from([LF])]);
        case "small":
          return Buffer.concat([
            FONT_B,
            toPrinterText(line.text),
            Buffer.from([LF]),
            FONT_A,
          ]);
        case "qr":
          return Buffer.concat([qrCommand(line.data), Buffer.from([LF])]);
        case "gap":
          return Buffer.from([LF]);
      }
    }),
  );

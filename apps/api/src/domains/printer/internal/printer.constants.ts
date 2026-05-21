/** TM-T20III, 80mm roll, 203 DPI — printable width 576 dots (standard mode, Epson specs). */
export const PRINT_WIDTH_PX = 576;

export const PRINTER_INITIALIZE_COMMAND = Buffer.from([0x1b, 0x40]);

export const PRINTER_OPEN_TIMEOUT_MS = 5_000;

export const PRINTER_FLUSH_TIMEOUT_MS = 30_000;

export const PRINTER_INITIALIZE_COMMAND = Buffer.from([0x1b, 0x40]);

export const PRINTER_OPEN_TIMEOUT_MS = 5_000;

/**
 * A ~1400-dot-tall receipt at 576 dots wide is ~100KB of GS v 0 payload and
 * ~175mm of paper at 203dpi, so a healthy flush lands in single-digit seconds.
 * Kept low enough that open + flush stays inside the web client's per-phase
 * print budget — see PRINT_ATTEMPT_TIMEOUT_MS.
 */
export const PRINTER_FLUSH_TIMEOUT_MS = 20_000;

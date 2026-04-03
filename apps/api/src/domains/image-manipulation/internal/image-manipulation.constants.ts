import type { DitherMode } from "@opendisplay/epaper-dithering";

import z from "zod";

/** TM-T20III, 80mm roll, 203 DPI — printable width 576 dots (standard mode, Epson specs). */
export const PRINT_WIDTH_PX = 576;

export const DITHER_MODE_OPTIONS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] satisfies Array<DitherMode>;

export const CONFIGURE_DITHER_SCHEMA = z.object({
  ditherMode: z.literal(DITHER_MODE_OPTIONS).optional().default(2),
  brightness: z.number().min(0).max(3).optional().default(1),
  contrast: z.number().min(0).max(3).optional().default(1),
  gamma: z.number().min(1).max(3).optional().default(1),
  threshold: z.number().int().min(0).max(255).optional().default(128),
});

import { photoReceiptTemplateSchema } from "@dither-booth/shared/routes";
import { ColorScheme, DitherMode } from "@opendisplay/epaper-dithering";
import z from "zod";

/**
 * Engine-side ordered dither against a blue-noise mask with macOS's gamma 1.8
 * tone, reproducing how macOS prints photos to the TM-T20III. The library's
 * own modes stop at 9.
 */
export const DITHER_MODE_BLUE_NOISE = 10;

export const DITHER_MODE_OPTIONS = [
  DitherMode.NONE,
  DitherMode.BURKES,
  DitherMode.ORDERED,
  DitherMode.FLOYD_STEINBERG,
  DitherMode.ATKINSON,
  DitherMode.STUCKI,
  DitherMode.SIERRA,
  DitherMode.SIERRA_LITE,
  DitherMode.JARVIS_JUDICE_NINKE,
  DitherMode.DIZZY,
  DITHER_MODE_BLUE_NOISE,
] satisfies Array<DitherMode | typeof DITHER_MODE_BLUE_NOISE>;

export const COLOR_SCHEME_CODE_OPTIONS = [
  ColorScheme.MONO,
  ColorScheme.GRAYSCALE_4,
  ColorScheme.GRAYSCALE_8,
  ColorScheme.GRAYSCALE_16,
] satisfies Array<ColorScheme>;

const PRINT_CONFIGURATION_FIELD_SCHEMAS = {
  ditherModeCode: z.literal(DITHER_MODE_OPTIONS),
  colorSchemeCode: z.literal(COLOR_SCHEME_CODE_OPTIONS),
  serpentine: z.boolean(),
  exposure: z.number().positive().max(4),
  saturation: z.number().min(0).max(4),
  shadows: z.number().min(0).max(1),
  highlights: z.number().min(0).max(1),
  toneGamma: z.number().min(1).max(3),
  threshold: z.number().int().min(0).max(255),
  rotation: z.number().int().min(0).max(360),
  template: photoReceiptTemplateSchema,
};

export const UPDATE_PRINT_CONFIGURATION_SCHEMA = z.object({
  ditherModeCode: PRINT_CONFIGURATION_FIELD_SCHEMAS.ditherModeCode.optional(),
  colorSchemeCode: PRINT_CONFIGURATION_FIELD_SCHEMAS.colorSchemeCode.optional(),
  serpentine: PRINT_CONFIGURATION_FIELD_SCHEMAS.serpentine.optional(),
  exposure: PRINT_CONFIGURATION_FIELD_SCHEMAS.exposure.optional(),
  saturation: PRINT_CONFIGURATION_FIELD_SCHEMAS.saturation.optional(),
  shadows: PRINT_CONFIGURATION_FIELD_SCHEMAS.shadows.optional(),
  highlights: PRINT_CONFIGURATION_FIELD_SCHEMAS.highlights.optional(),
  toneGamma: PRINT_CONFIGURATION_FIELD_SCHEMAS.toneGamma.optional(),
  threshold: PRINT_CONFIGURATION_FIELD_SCHEMAS.threshold.optional(),
  rotation: PRINT_CONFIGURATION_FIELD_SCHEMAS.rotation.optional(),
  template: PRINT_CONFIGURATION_FIELD_SCHEMAS.template.optional(),
});

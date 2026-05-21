import { ColorScheme, DitherMode } from "@opendisplay/epaper-dithering";
import z from "zod";

export const DITHER_MODE_OPTIONS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] satisfies Array<DitherMode>;

export const COLOR_SCHEME_CODE_OPTIONS = [
  ColorScheme.MONO,
  ColorScheme.GRAYSCALE_4,
  ColorScheme.GRAYSCALE_8,
  ColorScheme.GRAYSCALE_16,
] satisfies Array<ColorScheme>;

const DITHER_CONFIGURATION_FIELD_SCHEMAS = {
  ditherModeCode: z.literal(DITHER_MODE_OPTIONS),
  colorSchemeCode: z.literal(COLOR_SCHEME_CODE_OPTIONS),
  serpentine: z.boolean(),
  exposure: z.number().positive().max(4),
  saturation: z.number().min(0).max(4),
  shadows: z.number().min(0).max(1),
  highlights: z.number().min(0).max(1),
  threshold: z.number().int().min(0).max(255),
};

export const CREATE_DITHER_CONFIGURATION_SCHEMA = z.object({
  ditherModeCode: DITHER_CONFIGURATION_FIELD_SCHEMAS.ditherModeCode
    .optional()
    .default(DitherMode.BURKES),
  colorSchemeCode: DITHER_CONFIGURATION_FIELD_SCHEMAS.colorSchemeCode
    .optional()
    .default(ColorScheme.MONO),
  serpentine: DITHER_CONFIGURATION_FIELD_SCHEMAS.serpentine
    .optional()
    .default(true),
  exposure: DITHER_CONFIGURATION_FIELD_SCHEMAS.exposure.optional().default(1),
  saturation: DITHER_CONFIGURATION_FIELD_SCHEMAS.saturation
    .optional()
    .default(1),
  shadows: DITHER_CONFIGURATION_FIELD_SCHEMAS.shadows.optional().default(0),
  highlights: DITHER_CONFIGURATION_FIELD_SCHEMAS.highlights
    .optional()
    .default(0),
  threshold: DITHER_CONFIGURATION_FIELD_SCHEMAS.threshold
    .optional()
    .default(128),
});

export const UPDATE_DITHER_CONFIGURATION_SCHEMA = z.object({
  ditherModeCode: DITHER_CONFIGURATION_FIELD_SCHEMAS.ditherModeCode.optional(),
  colorSchemeCode:
    DITHER_CONFIGURATION_FIELD_SCHEMAS.colorSchemeCode.optional(),
  serpentine: DITHER_CONFIGURATION_FIELD_SCHEMAS.serpentine.optional(),
  exposure: DITHER_CONFIGURATION_FIELD_SCHEMAS.exposure.optional(),
  saturation: DITHER_CONFIGURATION_FIELD_SCHEMAS.saturation.optional(),
  shadows: DITHER_CONFIGURATION_FIELD_SCHEMAS.shadows.optional(),
  highlights: DITHER_CONFIGURATION_FIELD_SCHEMAS.highlights.optional(),
  threshold: DITHER_CONFIGURATION_FIELD_SCHEMAS.threshold.optional(),
});

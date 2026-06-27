import { receiptTemplateSchema } from "@dither-booth/shared/routes";
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

const PRINT_CONFIGURATION_FIELD_SCHEMAS = {
  ditherModeCode: z.literal(DITHER_MODE_OPTIONS),
  colorSchemeCode: z.literal(COLOR_SCHEME_CODE_OPTIONS),
  serpentine: z.boolean(),
  exposure: z.number().positive().max(4),
  saturation: z.number().min(0).max(4),
  shadows: z.number().min(0).max(1),
  highlights: z.number().min(0).max(1),
  threshold: z.number().int().min(0).max(255),
  template: receiptTemplateSchema,
};

export const UPDATE_PRINT_CONFIGURATION_SCHEMA = z.object({
  ditherModeCode: PRINT_CONFIGURATION_FIELD_SCHEMAS.ditherModeCode.optional(),
  colorSchemeCode: PRINT_CONFIGURATION_FIELD_SCHEMAS.colorSchemeCode.optional(),
  serpentine: PRINT_CONFIGURATION_FIELD_SCHEMAS.serpentine.optional(),
  exposure: PRINT_CONFIGURATION_FIELD_SCHEMAS.exposure.optional(),
  saturation: PRINT_CONFIGURATION_FIELD_SCHEMAS.saturation.optional(),
  shadows: PRINT_CONFIGURATION_FIELD_SCHEMAS.shadows.optional(),
  highlights: PRINT_CONFIGURATION_FIELD_SCHEMAS.highlights.optional(),
  threshold: PRINT_CONFIGURATION_FIELD_SCHEMAS.threshold.optional(),
  template: PRINT_CONFIGURATION_FIELD_SCHEMAS.template.optional(),
});

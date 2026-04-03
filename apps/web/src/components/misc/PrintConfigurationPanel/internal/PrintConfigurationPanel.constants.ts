import z from "zod";

export const DITHER_MODE_DEFAULT = 2 satisfies z.infer<
  typeof PRINT_CONFIGURATION_FORM_SCHEMA
>["ditherModeCode"];
export const BRIGHTNESS_DEFAULT = 1;
export const CONTRAST_DEFAULT = 1;
export const GAMMA_DEFAULT = 1;
export const THRESHOLD_DEFAULT = 128;

export const PRINT_CONFIGURATION_FORM_SCHEMA = z.object({
  ditherModeCode: z.literal([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  brightness: z.number().min(0).max(3),
  contrast: z.number().min(0).max(3),
  gamma: z.number().min(1).max(3),
  threshold: z.number().min(0).max(255),
});

export type PrintConfigurationFormValues = z.infer<
  typeof PRINT_CONFIGURATION_FORM_SCHEMA
>;

export const DEFAULT_PRINT_CONFIGURATION_FORM_VALUES: PrintConfigurationFormValues =
  {
    ditherModeCode: DITHER_MODE_DEFAULT,
    brightness: BRIGHTNESS_DEFAULT,
    contrast: CONTRAST_DEFAULT,
    gamma: GAMMA_DEFAULT,
    threshold: THRESHOLD_DEFAULT,
  };

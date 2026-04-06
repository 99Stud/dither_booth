import type {
  SelectFieldOption,
  SelectFieldValue,
} from "#components/fields/SelectField/internal/SelectField.types.ts";

import z from "zod";

import type { PrintConfigurationFormValues } from "./PrintConfigurationPanel.types";

export const DITHER_MODE_CODE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const DITHER_MODE_CODE_SCHEMA = z.literal(DITHER_MODE_CODE_OPTIONS);
export const DITHER_MODE_CODE_FIELD_OPTIONS: Array<
  SelectFieldOption<
    SelectFieldValue<PrintConfigurationFormValues, "ditherModeCode">
  >
> = [
  { label: "None", value: 0 },
  { label: "Burkes", value: 1 },
  { label: "Ordered", value: 2 },
  { label: "Floyd-Steinberg", value: 3 },
  { label: "Atkinson", value: 4 },
  { label: "Stucki", value: 5 },
  { label: "Sierra", value: 6 },
  { label: "Sierra Lite", value: 7 },
  { label: "Jarvis-Judice-Ninke", value: 8 },
];

export const PRINT_CONFIGURATION_FORM_SCHEMA = z.object({
  ditherModeCode: DITHER_MODE_CODE_SCHEMA,
  brightness: z.number().min(0).max(3),
  contrast: z.number().min(0).max(3),
  gamma: z.number().min(1).max(3),
  threshold: z.number().int().min(0).max(255),
});

export const DEFAULT_PRINT_CONFIGURATION_FORM_VALUES: PrintConfigurationFormValues =
  {
    ditherModeCode: 2,
    brightness: 1,
    contrast: 1,
    gamma: 1,
    threshold: 128,
  };

export const AUTOSAVE_DEBOUNCE_MS = 500;
export const PRINT_CONFIGURATION_PANEL_ERROR_SOURCE = "web.print-configuration";

type PersistedPrintConfiguration = Omit<
  PrintConfigurationFormValues,
  "ditherModeCode"
> & {
  ditherModeCode: number;
};

export const getPrintConfigurationFormValues = (
  ditherConfiguration?: PersistedPrintConfiguration | null,
): PrintConfigurationFormValues => {
  if (!ditherConfiguration) {
    return DEFAULT_PRINT_CONFIGURATION_FORM_VALUES;
  }

  return {
    ditherModeCode:
      ditherConfiguration.ditherModeCode as PrintConfigurationFormValues["ditherModeCode"],
    brightness: ditherConfiguration.brightness,
    contrast: ditherConfiguration.contrast,
    gamma: ditherConfiguration.gamma,
    threshold: ditherConfiguration.threshold,
  };
};

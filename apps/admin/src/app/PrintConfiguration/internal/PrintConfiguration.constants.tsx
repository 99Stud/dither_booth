import type {
  SelectFieldOption,
  SelectFieldValue,
} from "@dither-booth/ui/fields/SelectField";

import z from "zod";

import type {
  PrintConfigurationFormValues,
  SliderFieldConfig,
} from "./PrintConfiguration.types";

export const PRINT_CONFIGURATION_LOG_SOURCE = "admin.print-configuration";

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

export const COLOR_SCHEME_CODE_OPTIONS = [0, 5, 6, 7] as const;
export const COLOR_SCHEME_CODE_SCHEMA = z.literal(COLOR_SCHEME_CODE_OPTIONS);
export const COLOR_SCHEME_CODE_FIELD_OPTIONS: Array<
  SelectFieldOption<
    SelectFieldValue<PrintConfigurationFormValues, "colorSchemeCode">
  >
> = [
  { label: "Mono", value: 0 },
  { label: "Grayscale 4", value: 5 },
  { label: "Grayscale 8", value: 6 },
  { label: "Grayscale 16", value: 7 },
];

export const PRINT_CONFIGURATION_FORM_SCHEMA = z.object({
  ditherModeCode: DITHER_MODE_CODE_SCHEMA,
  colorSchemeCode: COLOR_SCHEME_CODE_SCHEMA,
  serpentine: z.boolean(),
  exposure: z.number().positive().max(4),
  saturation: z.number().min(0).max(4),
  shadows: z.number().min(0).max(1),
  highlights: z.number().min(0).max(1),
  threshold: z.number().int().min(0).max(255),
});

export const DEFAULT_PRINT_CONFIGURATION_FORM_VALUES: PrintConfigurationFormValues =
  {
    ditherModeCode: 1,
    colorSchemeCode: 0,
    serpentine: true,
    exposure: 1,
    saturation: 1,
    shadows: 0,
    highlights: 0,
    threshold: 128,
  };

export const PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS = 500;
export const PRINT_CONFIGURATION_PANEL_LOG_SOURCE = "admin.print-configuration";

type PersistedPrintConfiguration = Omit<
  PrintConfigurationFormValues,
  "colorSchemeCode" | "ditherModeCode"
> & {
  colorSchemeCode: number;
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
    colorSchemeCode:
      ditherConfiguration.colorSchemeCode as PrintConfigurationFormValues["colorSchemeCode"],
    serpentine: ditherConfiguration.serpentine,
    exposure: ditherConfiguration.exposure,
    saturation: ditherConfiguration.saturation,
    shadows: ditherConfiguration.shadows,
    highlights: ditherConfiguration.highlights,
    threshold: ditherConfiguration.threshold,
  };
};

export const SLIDER_FIELD_CONFIGS = [
  {
    formatValue: (value) => {
      const stops = Math.log2(value);
      const formattedStops = Number.isInteger(stops)
        ? String(stops)
        : stops.toFixed(1);

      const signedStops = stops > 0 ? `+${formattedStops}` : formattedStops;
      const stopLabel = Math.abs(stops) === 1 ? "stop" : "stops";

      return `${signedStops} ${stopLabel}`;
    },
    label: "Exposure",
    max: 2,
    min: -2,
    name: "exposure",
    sliderValueToValue: (value) => 2 ** value,
    step: 0.5,
    valueToSliderValue: (value) => Math.log2(value),
  },
  {
    formatValue: (value) => `${value.toFixed(1)}x`,
    label: "Saturation",
    max: 4,
    min: 0,
    name: "saturation",
    step: 0.1,
  },
  {
    formatValue: (value) => `${Math.round(value * 100)}%`,
    label: "Shadows lift",
    max: 1,
    min: 0,
    name: "shadows",
    step: 0.05,
  },
  {
    formatValue: (value) => `${Math.round(value * 100)}%`,
    label: "Highlights compression",
    max: 1,
    min: 0,
    name: "highlights",
    step: 0.05,
  },
  {
    formatValue: (value) => String(value),
    label: "Threshold",
    max: 255,
    min: 0,
    name: "threshold",
    step: 1,
  },
] satisfies ReadonlyArray<SliderFieldConfig>;

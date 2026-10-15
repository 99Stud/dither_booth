import type {
  SelectFieldOption,
  SelectFieldValue,
} from "@dither-booth/ui/fields/SelectField";

import z from "zod";

import type {
  PrintConfigurationFormValues,
  PrintConfigurationTab,
  SliderFieldConfig,
} from "./PrintConfiguration.types";

export const PRINT_CONFIGURATION_LOG_SOURCE = "admin.print-configuration";

/** Engine-side ordered dither that reproduces how macOS prints photos. */
export const DITHER_MODE_CODE_BLUE_NOISE = 10;

export const DITHER_MODE_CODE_OPTIONS = [
  0,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  DITHER_MODE_CODE_BLUE_NOISE,
] as const;
export const DITHER_MODE_CODE_SCHEMA = z.literal(DITHER_MODE_CODE_OPTIONS);
export const DITHER_MODE_CODE_FIELD_OPTIONS: Array<
  SelectFieldOption<
    SelectFieldValue<PrintConfigurationFormValues, "ditherModeCode">
  >
> = [
  { label: "Blue noise (macOS)", value: DITHER_MODE_CODE_BLUE_NOISE },
  { label: "None", value: 0 },
  { label: "Burkes", value: 1 },
  { label: "Ordered", value: 2 },
  { label: "Floyd-Steinberg", value: 3 },
  { label: "Atkinson", value: 4 },
  { label: "Stucki", value: 5 },
  { label: "Sierra", value: 6 },
  { label: "Sierra Lite", value: 7 },
  { label: "Jarvis-Judice-Ninke", value: 8 },
  { label: "Dizzy", value: 9 },
];

export const COLOR_SCHEME_CODE_OPTIONS = [0, 5, 6, 9] as const;
export const COLOR_SCHEME_CODE_SCHEMA = z.literal(COLOR_SCHEME_CODE_OPTIONS);
export const COLOR_SCHEME_CODE_FIELD_OPTIONS: Array<
  SelectFieldOption<
    SelectFieldValue<PrintConfigurationFormValues, "colorSchemeCode">
  >
> = [
  { label: "Mono", value: 0 },
  { label: "Grayscale 4", value: 5 },
  { label: "Grayscale 16", value: 6 },
  { label: "Grayscale 8", value: 9 },
];

export const PRINT_CONFIGURATION_FORM_SCHEMA = z.object({
  ditherModeCode: DITHER_MODE_CODE_SCHEMA,
  colorSchemeCode: COLOR_SCHEME_CODE_SCHEMA,
  serpentine: z.boolean(),
  exposure: z.number().positive().max(4),
  saturation: z.number().min(0).max(4),
  shadows: z.number().min(0).max(1),
  highlights: z.number().min(0).max(1),
  toneGamma: z.number().min(1).max(3),
  threshold: z.number().int().min(0).max(255),
  rotation: z.number().int().min(0).max(360),
});

/** macOS encodes gray at gamma 1.8 before halftoning for the TM-T20III. */
export const MACOS_TONE_GAMMA = 1.8;

/** Library-only settings the blue-noise mode ignores, as macOS has no such step. */
export const BLUE_NOISE_IGNORED_FIELDS = new Set<
  keyof PrintConfigurationFormValues
>(["colorSchemeCode", "serpentine", "saturation", "shadows", "highlights"]);

/** Settings only the blue-noise mode reads. */
export const BLUE_NOISE_ONLY_FIELDS = new Set<
  keyof PrintConfigurationFormValues
>(["toneGamma"]);

export const DEFAULT_PRINT_CONFIGURATION_FORM_VALUES: PrintConfigurationFormValues =
  {
    ditherModeCode: DITHER_MODE_CODE_BLUE_NOISE,
    colorSchemeCode: 0,
    serpentine: true,
    exposure: 1,
    saturation: 1,
    shadows: 0,
    highlights: 0,
    toneGamma: MACOS_TONE_GAMMA,
    threshold: 128,
    rotation: 0,
  };

export const PRINT_CONFIGURATION_FORM_AUTOSAVE_DEBOUNCE_MS = 500;

export const PRINT_CONFIGURATION_TABS = [
  "dithering",
  "receipt",
] as const satisfies ReadonlyArray<PrintConfigurationTab>;

export const DITHERING_PREVIEW_FIELDS = [
  "ditherModeCode",
  "colorSchemeCode",
  "serpentine",
  "exposure",
  "saturation",
  "shadows",
  "highlights",
  "toneGamma",
  "rotation",
] as const satisfies ReadonlyArray<keyof PrintConfigurationFormValues>;

export const RECEIPT_PREVIEW_FIELDS = [
  ...DITHERING_PREVIEW_FIELDS,
  "threshold",
] as const satisfies ReadonlyArray<keyof PrintConfigurationFormValues>;

export const PREVIEW_FIELDS_BY_TAB = {
  dithering: DITHERING_PREVIEW_FIELDS,
  receipt: RECEIPT_PREVIEW_FIELDS,
} satisfies Record<
  PrintConfigurationTab,
  ReadonlyArray<keyof PrintConfigurationFormValues>
>;

type PersistedPrintConfiguration = Omit<
  PrintConfigurationFormValues,
  "colorSchemeCode" | "ditherModeCode"
> & {
  colorSchemeCode: number;
  ditherModeCode: number;
};

export const getPrintConfigurationFormValues = (
  printConfiguration?: PersistedPrintConfiguration | null,
): PrintConfigurationFormValues => {
  if (!printConfiguration) {
    return DEFAULT_PRINT_CONFIGURATION_FORM_VALUES;
  }

  return {
    ditherModeCode:
      printConfiguration.ditherModeCode as PrintConfigurationFormValues["ditherModeCode"],
    colorSchemeCode:
      printConfiguration.colorSchemeCode as PrintConfigurationFormValues["colorSchemeCode"],
    serpentine: printConfiguration.serpentine,
    exposure: printConfiguration.exposure,
    saturation: printConfiguration.saturation,
    shadows: printConfiguration.shadows,
    highlights: printConfiguration.highlights,
    toneGamma: printConfiguration.toneGamma,
    threshold: printConfiguration.threshold,
    rotation: printConfiguration.rotation,
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

      return `${signedStops} EV`;
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
    formatValue: (value) =>
      // Slider steps accumulate float error, so compare at display precision.
      value.toFixed(1) === MACOS_TONE_GAMMA.toFixed(1)
        ? `${value.toFixed(1)} (macOS)`
        : value.toFixed(1),
    label: "Tone gamma",
    max: 2.6,
    min: 1.2,
    name: "toneGamma",
    step: 0.1,
  },
] satisfies ReadonlyArray<SliderFieldConfig>;

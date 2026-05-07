import type z from "zod";

import type {
  COLOR_SCHEME_CODE_OPTIONS,
  DITHER_MODE_CODE_OPTIONS,
  PRINT_CONFIGURATION_FORM_SCHEMA,
} from "./PrintConfiguration.constants";

type PrintConfigurationSchema = typeof PRINT_CONFIGURATION_FORM_SCHEMA;
export type PrintConfigurationFormValues = z.infer<PrintConfigurationSchema>;
type PrintConfigurationFormValuesKeys = keyof PrintConfigurationFormValues;
type PrintConfigurationSliderFieldName = Extract<
  PrintConfigurationFormValuesKeys,
  "exposure" | "saturation" | "shadows" | "highlights" | "threshold"
>;

export type PrintConfigurationFormDitherModeCode =
  (typeof DITHER_MODE_CODE_OPTIONS)[number];
export type PrintConfigurationFormColorSchemeCode =
  (typeof COLOR_SCHEME_CODE_OPTIONS)[number];

export type SliderFieldConfig = {
  formatValue: (value: number) => string;
  label: string;
  max: number;
  min: number;
  name: PrintConfigurationSliderFieldName;
  sliderValueToValue?: (value: number) => number;
  step: number;
  valueToSliderValue?: (value: number) => number;
};

import type z from "zod";

import type {
  DITHER_MODE_CODE_OPTIONS,
  PRINT_CONFIGURATION_FORM_SCHEMA,
} from "./PrintConfigurationPanel.constants";

type PrintConfigurationSchema = typeof PRINT_CONFIGURATION_FORM_SCHEMA;
export type PrintConfigurationFormValues = z.infer<PrintConfigurationSchema>;
type PrintConfigurationFormValuesKeys = keyof PrintConfigurationFormValues;

export type PrintConfigurationFormDitherModeCode =
  (typeof DITHER_MODE_CODE_OPTIONS)[number];

export type SliderFieldConfig = {
  formatValue: (value: number) => string;
  label: string;
  max: number;
  min: number;
  name: Extract<
    PrintConfigurationFormValuesKeys,
    "brightness" | "contrast" | "gamma" | "threshold"
  >;
  step: number;
};

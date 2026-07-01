import type { FC } from "react";

import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { SliderField } from "@dither-booth/ui/fields/SliderField";
import { SwitchField } from "@dither-booth/ui/fields/SwitchField";
import clsx from "clsx";

import type { PrintConfigurationFormApi } from "#app/PrintConfiguration/internal/PrintConfiguration.types";

import {
  COLOR_SCHEME_CODE_FIELD_OPTIONS,
  DITHER_MODE_CODE_FIELD_OPTIONS,
  RECEIPT_TEMPLATE_FIELD_OPTIONS,
  SLIDER_FIELD_CONFIGS,
} from "#app/PrintConfiguration/internal/PrintConfiguration.constants";

interface PrintConfigurationFormFieldsProps {
  form: PrintConfigurationFormApi;
  isSelectFieldDisabled: boolean;
  isSliderFieldDisabled: boolean;
  isSwitchFieldDisabled: boolean;
}

export const PrintConfigurationFormFields: FC<
  PrintConfigurationFormFieldsProps
> = ({
  form,
  isSelectFieldDisabled,
  isSliderFieldDisabled,
  isSwitchFieldDisabled,
}) => {
  return (
    <div className={clsx("flex flex-col gap-4")}>
      <SelectField
        form={form}
        name="ditherModeCode"
        label="Dither Mode"
        placeholder="Select a dither mode"
        options={DITHER_MODE_CODE_FIELD_OPTIONS}
        disabled={isSelectFieldDisabled}
      />
      <SelectField
        form={form}
        name="colorSchemeCode"
        label="Color Scheme"
        placeholder="Select a color scheme"
        options={COLOR_SCHEME_CODE_FIELD_OPTIONS}
        disabled={isSelectFieldDisabled}
      />
      <SwitchField
        className={clsx("mb-6")}
        form={form}
        name="serpentine"
        label="Serpentine"
        disabled={isSwitchFieldDisabled}
      />
      {SLIDER_FIELD_CONFIGS.map((sliderField) => (
        <SliderField
          key={sliderField.name}
          form={form}
          name={sliderField.name}
          label={sliderField.label}
          min={sliderField.min}
          max={sliderField.max}
          step={sliderField.step}
          formatValue={sliderField.formatValue}
          sliderValueToValue={sliderField.sliderValueToValue}
          valueToSliderValue={sliderField.valueToSliderValue}
          disabled={isSliderFieldDisabled}
        />
      ))}
      <SelectField
        className={clsx("mt-6")}
        form={form}
        name="template"
        label="Receipt Template"
        placeholder="Select a receipt template"
        options={RECEIPT_TEMPLATE_FIELD_OPTIONS}
        disabled={isSelectFieldDisabled}
      />
      <SliderField
        key="threshold"
        form={form}
        name="threshold"
        label="Threshold"
        min={0}
        max={255}
        step={1}
        formatValue={(value) => String(value)}
        disabled={isSliderFieldDisabled}
      />
    </div>
  );
};

import type { FC } from "react";

import { SelectField } from "@dither-booth/ui/fields/SelectField";
import { SliderField } from "@dither-booth/ui/fields/SliderField";
import { SwitchField } from "@dither-booth/ui/fields/SwitchField";
import { useStore } from "@tanstack/react-form";
import clsx from "clsx";

import type {
  PrintConfigurationField,
  PrintConfigurationFormApi,
} from "#app/PrintConfiguration/internal/PrintConfiguration.types";

import {
  BLUE_NOISE_IGNORED_FIELDS,
  BLUE_NOISE_ONLY_FIELDS,
  COLOR_SCHEME_CODE_FIELD_OPTIONS,
  DITHER_MODE_CODE_BLUE_NOISE,
  DITHER_MODE_CODE_FIELD_OPTIONS,
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
  const isBlueNoise = useStore(
    form.store,
    (state) => state.values.ditherModeCode === DITHER_MODE_CODE_BLUE_NOISE,
  );
  const doesNotApply = (field: PrintConfigurationField) =>
    isBlueNoise
      ? BLUE_NOISE_IGNORED_FIELDS.has(field)
      : BLUE_NOISE_ONLY_FIELDS.has(field);

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
        disabled={isSelectFieldDisabled || doesNotApply("colorSchemeCode")}
      />
      <SwitchField
        className={clsx("mb-6")}
        form={form}
        name="serpentine"
        label="Serpentine"
        disabled={isSwitchFieldDisabled || doesNotApply("serpentine")}
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
          disabled={isSliderFieldDisabled || doesNotApply(sliderField.name)}
        />
      ))}
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
      <SliderField
        key="rotation"
        form={form}
        name="rotation"
        label="Rotation"
        min={0}
        max={360}
        step={45}
        formatValue={(value) => `${value}°`}
        disabled={isSliderFieldDisabled}
      />
    </div>
  );
};

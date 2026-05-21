import type { ComponentProps } from "react";

import {
  type DeepKeys,
  type DeepValue,
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
} from "@tanstack/react-form";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Slider } from "#components/ui/slider";

const getSliderValue = (value: number | ReadonlyArray<number>) => {
  return Array.isArray(value) ? value[0] : value;
};

type SliderFieldValue<TFormData, TName extends DeepKeys<TFormData>> = Extract<
  DeepValue<TFormData, TName>,
  number
>;

type SliderFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: DeepValue<TFormData, TName> extends number
    ? TName
    : never;
}[DeepKeys<TFormData>];

type SliderFieldProps<
  TFormData,
  TName extends SliderFieldName<TFormData>,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta,
> = {
  form: ReactFormExtendedApi<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >;
  name: TName;
  label: string;
  formatValue: (value: SliderFieldValue<TFormData, TName>) => string;
  sliderValueToValue?: (value: number) => SliderFieldValue<TFormData, TName>;
  valueToSliderValue?: (value: SliderFieldValue<TFormData, TName>) => number;
} & Omit<
  ComponentProps<typeof Slider>,
  "id" | "name" | "value" | "onValueChange" | "form"
>;

export const SliderField = <
  TFormData,
  TName extends SliderFieldName<TFormData>,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta,
>(
  props: SliderFieldProps<
    TFormData,
    TName,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >,
) => {
  const {
    form,
    name,
    label,
    formatValue,
    sliderValueToValue,
    valueToSliderValue,
    ...sliderProps
  } = props;
  return (
    <form.Field
      name={name}
      // oxlint-disable-next-line react/no-children-prop
      children={(field) => {
        const fieldValue = field.state.value as SliderFieldValue<
          TFormData,
          TName
        >;
        const sliderValue = valueToSliderValue
          ? valueToSliderValue(fieldValue)
          : fieldValue;
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;

        return (
          <Field orientation="responsive" data-invalid={isInvalid}>
            <FieldContent>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </FieldContent>
            <div className="flex items-center gap-2">
              <Slider
                {...sliderProps}
                id={field.name}
                name={field.name}
                value={[sliderValue]}
                onValueChange={(value) => {
                  const nextSliderValue = getSliderValue(value);
                  const nextFieldValue = sliderValueToValue
                    ? sliderValueToValue(nextSliderValue)
                    : (nextSliderValue as SliderFieldValue<TFormData, TName>);

                  field.handleChange(nextFieldValue);
                }}
              />
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {formatValue(fieldValue)}
              </span>
            </div>
          </Field>
        );
      }}
    />
  );
};

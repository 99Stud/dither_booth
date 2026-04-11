import type {
  DeepKeys,
  DeepValue,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";
import type { ComponentProps, Key } from "react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select.tsx";
import clsx from "clsx";

import type { SelectFieldOption } from "./internal/SelectField.types";

type SelectFieldValue<TFormData, TName extends DeepKeys<TFormData>> = Extract<
  DeepValue<TFormData, TName>,
  Key
>;

type SelectFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: SelectFieldValue<
    TFormData,
    TName
  > extends never
    ? never
    : TName;
}[DeepKeys<TFormData>];

type SelectProps<
  TFormData,
  TName extends SelectFieldName<TFormData>,
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
  placeholder: string;
  options: Array<SelectFieldOption<SelectFieldValue<TFormData, TName>>>;
} & Omit<
  ComponentProps<typeof Select>,
  "id" | "name" | "value" | "onValueChange"
>;

export const SelectField = <
  TFormData,
  TName extends SelectFieldName<TFormData>,
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
  props: SelectProps<
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
  const { form, name, label, placeholder, options, ...selectProps } = props;

  return (
    <form.Field
      name={name}
      // oxlint-disable-next-line react/no-children-prop
      children={(field) => {
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;
        return (
          <Field orientation="responsive" data-invalid={isInvalid}>
            <FieldContent>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </FieldContent>
            <Select
              {...selectProps}
              id={field.name}
              items={options}
              name={field.name}
              value={field.state.value as SelectFieldValue<TFormData, TName>}
              onValueChange={(value) => {
                field.handleChange(value as SelectFieldValue<TFormData, TName>);
              }}
            >
              <SelectTrigger
                className={clsx("min-w-[120px]")}
                aria-invalid={isInvalid}
                id={field.name}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        );
      }}
    />
  );
};

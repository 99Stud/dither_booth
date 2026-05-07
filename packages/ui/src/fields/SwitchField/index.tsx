import type {
  DeepKeys,
  DeepValue,
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";
import type { ComponentProps } from "react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Switch } from "#components/ui/switch";

type SwitchFieldValue<TFormData, TName extends DeepKeys<TFormData>> = Extract<
  DeepValue<TFormData, TName>,
  boolean
>;

type SwitchFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: DeepValue<TFormData, TName> extends boolean
    ? TName
    : never;
}[DeepKeys<TFormData>];

type SwitchFieldProps<
  TFormData,
  TName extends SwitchFieldName<TFormData>,
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
} & Omit<
  ComponentProps<typeof Switch>,
  "id" | "name" | "checked" | "onCheckedChange" | "form"
>;

export const SwitchField = <
  TFormData,
  TName extends SwitchFieldName<TFormData>,
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
  props: SwitchFieldProps<
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
  const { form, name, label, ...switchProps } = props;
  return (
    <form.Field
      name={name}
      // oxlint-disable-next-line react/no-children-prop
      children={(field) => {
        const fieldValue = field.state.value as SwitchFieldValue<
          TFormData,
          TName
        >;
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;
        return (
          <Field
            orientation="responsive"
            data-disabled={switchProps.disabled}
            data-invalid={isInvalid}
          >
            <FieldContent>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </FieldContent>
            <Switch
              {...switchProps}
              id={field.name}
              name={field.name}
              checked={fieldValue}
              onCheckedChange={(checked) => {
                field.handleChange(
                  checked as SwitchFieldValue<TFormData, TName>,
                );
              }}
            />
          </Field>
        );
      }}
    />
  );
};

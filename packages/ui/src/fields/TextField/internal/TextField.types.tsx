import type { DeepKeys, DeepValue } from "@tanstack/react-form";

export type TextFieldValue<
  TFormData,
  TName extends DeepKeys<TFormData>,
> = Extract<DeepValue<TFormData, TName>, string>;

export type TextFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: TextFieldValue<TFormData, TName> extends never
    ? never
    : TName;
}[DeepKeys<TFormData>];

import type { DeepKeys, DeepValue } from "@tanstack/react-form";

export type NumberFieldValue<
  TFormData,
  TName extends DeepKeys<TFormData>,
> = Extract<DeepValue<TFormData, TName>, number>;

export type NumberFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: NumberFieldValue<
    TFormData,
    TName
  > extends never
    ? never
    : TName;
}[DeepKeys<TFormData>];

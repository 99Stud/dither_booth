import type { DeepKeys, DeepValue } from "@tanstack/react-form";
import type { Key, ReactNode } from "react";

export type SelectFieldOption<TFormDataValue extends Key> = {
  label: ReactNode;
  value: TFormDataValue;
};

export type SelectFieldValue<
  TFormData,
  TName extends DeepKeys<TFormData>,
> = Extract<DeepValue<TFormData, TName>, Key>;

export type SelectFieldName<TFormData> = {
  [TName in DeepKeys<TFormData>]: SelectFieldValue<
    TFormData,
    TName
  > extends never
    ? never
    : TName;
}[DeepKeys<TFormData>];

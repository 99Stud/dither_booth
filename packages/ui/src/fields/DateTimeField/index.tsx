import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";

import { format, parse } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "#components/ui/button";
import { Calendar } from "#components/ui/calendar";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#components/ui/popover";

import type {
  TextFieldName,
  TextFieldValue,
} from "../TextField/internal/TextField.types";

/** The value: local `2026-10-31T19:00`, or "" when nothing is picked. */
const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm";

const parseValue = (value: string) =>
  value === "" ? undefined : parse(value, VALUE_FORMAT, new Date());

type DateTimeFieldProps<
  TFormData,
  TName extends TextFieldName<TFormData>,
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
  className?: string;
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
  /** The time a newly picked day starts with, `HH:mm`. */
  defaultTime?: string;
  /** What the day button says while nothing is picked. */
  placeholder?: string;
};

/**
 * A day from a calendar and a time, as one string value (or "" when empty,
 * cleared from the calendar). Picking a day keeps the time already set, else
 * starts at `defaultTime`.
 */
export const DateTimeField = <
  TFormData,
  TName extends TextFieldName<TFormData>,
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
  props: DateTimeFieldProps<
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
    className,
    form,
    name,
    label,
    defaultTime = "00:00",
    placeholder = "Pick a day",
  } = props;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <form.Field
      name={name}
      // oxlint-disable-next-line react/no-children-prop
      children={(field) => {
        const isInvalid =
          field.state.meta.isTouched && !field.state.meta.isValid;
        const value = field.state.value as string;
        const date = parseValue(value);
        const time = date ? format(date, "HH:mm") : "";
        const setValue = (next: string) => {
          field.handleChange(next as TextFieldValue<TFormData, TName>);
          field.handleBlur();
        };

        return (
          <Field
            orientation="responsive"
            data-invalid={isInvalid}
            className={className}
          >
            <FieldContent>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </FieldContent>
            <div className="flex min-w-0 items-center gap-2">
              <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      id={field.name}
                      variant="outline"
                      aria-invalid={isInvalid}
                      className="min-w-0 flex-1 justify-between font-normal"
                    />
                  }
                >
                  <span
                    className={
                      date ? "truncate" : "truncate text-muted-foreground"
                    }
                  >
                    {date ? format(date, "EEE d MMM yyyy") : placeholder}
                  </span>
                  <ChevronDownIcon data-icon="inline-end" />
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto gap-0 overflow-hidden p-0"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    // Clicking the picked day keeps it: clearing is its own button.
                    required
                    selected={date}
                    defaultMonth={date}
                    weekStartsOn={1}
                    onSelect={(day) => {
                      setValue(
                        `${format(day, "yyyy-MM-dd")}T${time || defaultTime}`,
                      );
                      setIsOpen(false);
                    }}
                  />
                  {/* Clearing lives with the day it clears, not in the row. */}
                  {date && (
                    <div className="border-t p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setValue("");
                          setIsOpen(false);
                        }}
                      >
                        Clear {label.toLowerCase()}
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                aria-label={`${label}, time`}
                // The browser's own clock button is hidden, as in shadcn's
                // date and time picker: the field is typed into.
                className="w-24 shrink-0 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                disabled={!date}
                value={time}
                onChange={(event) => {
                  if (date && event.target.value) {
                    setValue(
                      `${format(date, "yyyy-MM-dd")}T${event.target.value}`,
                    );
                  }
                }}
              />
            </div>
          </Field>
        );
      }}
    />
  );
};

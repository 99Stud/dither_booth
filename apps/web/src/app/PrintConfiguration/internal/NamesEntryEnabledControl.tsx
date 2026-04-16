import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field.tsx";
import { DEFAULT_BOOTH_TICKET_DISPLAY_NAMES } from "#lib/ticket-names.ts";
import type { FC } from "react";

export const NamesEntryEnabledControl: FC<{
  inputId: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}> = (props) => {
  const { inputId, checked, onCheckedChange, disabled } = props;

  return (
    <Field orientation="responsive">
      <FieldContent className="gap-1.5">
        <FieldLabel htmlFor={inputId}>Name entry</FieldLabel>
        <FieldDescription>
          When off, check-in sends guests straight to the booth with default ticket labels (
          {DEFAULT_BOOTH_TICKET_DISPLAY_NAMES.join(", ")}).
        </FieldDescription>
      </FieldContent>
      <div className="flex items-center pt-1">
        <input
          id={inputId}
          type="checkbox"
          className="size-4 accent-primary"
          checked={checked}
          disabled={disabled}
          onChange={(e) => {
            onCheckedChange(e.target.checked);
          }}
        />
      </div>
    </Field>
  );
};

import type { FC } from "react";

import { COPY_FIELDS, type CopyKey } from "@dither-booth/shared/kit-copy";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { useState } from "react";

const VARIABLE_HINTS: Record<string, string> = {
  count: "{count} becomes the number.",
};

interface KitCopyFieldProps {
  copyKey: CopyKey;
  /** The kit's own text for this line. */
  defaultText: string;
  /** The event's text, or undefined when it uses the kit's. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/**
 * One line of kit text. It shows what the booth will show: the kit's text
 * until it is edited, a "Changed" badge and a reset once it differs.
 */
export const KitCopyField: FC<KitCopyFieldProps> = (props) => {
  const { copyKey, defaultText, value, onChange } = props;
  const field = COPY_FIELDS[copyKey];
  const [isFocused, setIsFocused] = useState(false);
  const text = value ?? defaultText;
  const isChanged = value !== undefined && value.trim() !== defaultText;
  const isOptional = "optional" in field;
  const isMissing = !isOptional && text.trim() === "";
  const inputId = `kit-copy-${copyKey}`;
  const hintId = `${inputId}-hint`;
  const hints = [
    isOptional ? "Leave empty to hide this line." : null,
    ...("variables" in field
      ? field.variables.map((name) => VARIABLE_HINTS[name])
      : []),
  ].filter(Boolean);
  // The count only matters while typing, or once the line is nearly full.
  const showCount = isFocused || text.length >= field.maxLength * 0.8;

  return (
    <Field orientation="vertical" data-invalid={isMissing}>
      <FieldContent className={clsx("flex-row items-center gap-2")}>
        <FieldLabel htmlFor={inputId}>{field.label}</FieldLabel>
        {isChanged ? <Badge variant="secondary">Changed</Badge> : null}
      </FieldContent>
      <div className={clsx("flex items-center gap-2")}>
        <Input
          id={inputId}
          type="text"
          value={text}
          maxLength={field.maxLength}
          aria-invalid={isMissing}
          aria-describedby={hintId}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => {
            const next = event.target.value;
            onChange(next === defaultText ? undefined : next);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Kept in the layout so the field doesn't jump when it appears.
          className={clsx(!isChanged && "invisible")}
          disabled={!isChanged}
          aria-label={`Reset ${field.label} to the kit's text`}
          title="Use the kit's text"
          onClick={() => onChange(undefined)}
        >
          <Undo2 />
        </Button>
      </div>
      <div
        id={hintId}
        className={clsx(
          "flex items-start justify-between gap-3 pr-10",
          hints.length === 0 && !isMissing && !showCount && "sr-only",
        )}
      >
        {isMissing ? (
          <FieldError>This line can&apos;t be empty.</FieldError>
        ) : (
          <FieldDescription>{hints.join(" ")}</FieldDescription>
        )}
        <FieldDescription
          className={clsx("shrink-0 tabular-nums", !showCount && "sr-only")}
          aria-label={`${text.length} of ${field.maxLength} characters`}
        >
          {text.length}/{field.maxLength}
        </FieldDescription>
      </div>
    </Field>
  );
};

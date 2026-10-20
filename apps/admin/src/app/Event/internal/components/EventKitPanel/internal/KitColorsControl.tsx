import type { ColorsControl } from "@dither-booth/shared/background-controls";
import type { FC } from "react";

import { FieldDescription } from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import clsx from "clsx";
import { Check } from "lucide-react";
import { useState } from "react";

const HEX_PATTERN = /^#[0-9a-f]{6}$/iu;

const sameColors = (a: string[], b: string[]) =>
  a.length === b.length &&
  a.every((color, index) => color.toLowerCase() === b[index]?.toLowerCase());

/** A row of colour dots: how a swatch reads at a glance. */
const ColorDots: FC<{ colors: string[] }> = ({ colors }) => (
  <span aria-hidden className={clsx("flex -space-x-1.5")}>
    {colors.map((color, index) => (
      <span
        // oxlint-disable-next-line react/no-array-index-key -- colours repeat
        key={index}
        className={clsx("size-5 rounded-full border border-border")}
        style={{ backgroundColor: color }}
      />
    ))}
  </span>
);

interface KitColorsControlProps {
  id: string;
  control: ColorsControl;
  value: string[];
  /** The kit look's colours, offered first. */
  kitColors: string[];
  onChange: (value: string[]) => void;
}

/**
 * Colours picked from named swatches, with the kit's own first, or set by
 * hand under "Custom": one colour well per slot (Paper, Ink…).
 */
export const KitColorsControl: FC<KitColorsControlProps> = (props) => {
  const { id, control, value, kitColors, onChange } = props;
  const options = [
    { id: "kit", label: "Kit", colors: kitColors },
    ...control.swatches.filter(
      (swatch) => !sameColors(swatch.colors, kitColors),
    ),
  ];
  const selected = options.find((option) => sameColors(option.colors, value));
  const [isCustomOpen, setIsCustomOpen] = useState(!selected);
  const showCustom = isCustomOpen || !selected;

  return (
    <div className={clsx("flex flex-col gap-2")}>
      <span id={`${id}-label`} className={clsx("text-sm font-medium")}>
        {control.label}
      </span>
      <FieldDescription>{control.help}</FieldDescription>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className={clsx("flex flex-wrap gap-2")}
      >
        {options.map((option) => {
          const isSelected = !showCustom && selected?.id === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                setIsCustomOpen(false);
                onChange(option.colors);
              }}
              className={clsx(
                "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                "transition-colors hover:bg-muted",
                "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-background",
              )}
            >
              <ColorDots colors={option.colors} />
              {option.label}
              {isSelected ? (
                <Check aria-hidden className={clsx("size-3.5")} />
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={showCustom}
          onClick={() => setIsCustomOpen(true)}
          className={clsx(
            "rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            showCustom
              ? "border-primary bg-primary/5"
              : "border-border bg-background",
          )}
        >
          Custom
        </button>
      </div>
      {showCustom ? (
        <div className={clsx("grid gap-3 pt-1 sm:grid-cols-3")}>
          {control.slots.map((slot, index) => (
            <ColorWell
              key={slot}
              id={`${id}-${index}`}
              label={slot}
              value={value[index] ?? kitColors[index] ?? ""}
              onChange={(color) => {
                const next = [...value];
                next[index] = color;
                onChange(next);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

/**
 * One colour: the system picker behind a swatch, and its hex code, which
 * only reaches the draft once it is a full `#rrggbb`.
 */
export const ColorWell: FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, value, onChange }) => {
  const [text, setText] = useState(value);
  const isValid = HEX_PATTERN.test(text);

  return (
    <div className={clsx("flex flex-col gap-1")}>
      <label htmlFor={`${id}-hex`} className={clsx("text-xs font-medium")}>
        {label}
      </label>
      <div className={clsx("flex items-center gap-2")}>
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={value}
          onChange={(event) => {
            setText(event.target.value);
            onChange(event.target.value);
          }}
          className={clsx(
            "size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5",
          )}
        />
        <Input
          id={`${id}-hex`}
          value={text}
          maxLength={7}
          aria-invalid={!isValid}
          aria-describedby={isValid ? undefined : `${id}-error`}
          className={clsx("font-mono")}
          onChange={(event) => {
            const next = event.target.value.trim();
            setText(next);
            if (HEX_PATTERN.test(next)) onChange(next.toLowerCase());
          }}
        />
      </div>
      {isValid ? null : (
        <p id={`${id}-error`} className={clsx("text-xs text-destructive")}>
          Use # and six letters or digits, as the picker gives.
        </p>
      )}
    </div>
  );
};

import type { FC } from "react";

import { SLIDER_DEFAULT } from "@dither-booth/shared/background-controls";
import { Button } from "@dither-booth/ui/components/ui/button";
import { FieldDescription } from "@dither-booth/ui/components/ui/field";
import { Slider } from "@dither-booth/ui/components/ui/slider";
import clsx from "clsx";
import { Undo2 } from "lucide-react";

interface KitWordSliderProps {
  id: string;
  label: string;
  help: string;
  ends: [low: string, high: string];
  value: number;
  onChange: (value: number) => void;
}

/** Reads a position as words: "Kit look", or the nearer end and how far. */
const describe = (value: number, [low, high]: [string, string]) =>
  value === SLIDER_DEFAULT
    ? "Kit look"
    : `${value < SLIDER_DEFAULT ? low : high}, ${value}%`;

/**
 * A slider in words, not numbers: its ends are named ("Thin", "Thick") and
 * the middle mark is the kit's own look, which the reset returns to.
 */
export const KitWordSlider: FC<KitWordSliderProps> = (props) => {
  const { id, label, help, ends, value, onChange } = props;
  const isChanged = value !== SLIDER_DEFAULT;

  return (
    <div className={clsx("flex flex-col gap-1.5")}>
      <div className={clsx("flex items-center justify-between gap-2")}>
        <span id={`${id}-label`} className={clsx("text-sm font-medium")}>
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={clsx(!isChanged && "invisible")}
          disabled={!isChanged}
          aria-label={`Reset ${label} to the kit's look`}
          title="Back to the kit's look"
          onClick={() => onChange(SLIDER_DEFAULT)}
        >
          <Undo2 />
        </Button>
      </div>
      <FieldDescription id={`${id}-help`}>{help}</FieldDescription>
      <div className={clsx("flex items-center gap-3 pt-1")}>
        <span
          aria-hidden
          className={clsx("w-14 shrink-0 text-xs text-muted-foreground")}
        >
          {ends[0]}
        </span>
        <div className={clsx("relative flex-1")}>
          {/* The kit's own look, so "back to the middle" is easy to find. */}
          <span
            aria-hidden
            className={clsx(
              "pointer-events-none absolute top-1/2 left-1/2 h-3 w-px",
              "-translate-x-1/2 -translate-y-1/2 bg-border",
            )}
          />
          <Slider
            min={0}
            max={100}
            step={1}
            value={[value]}
            getAriaLabel={() => label}
            getAriaValueText={(_, current) => describe(current, ends)}
            aria-describedby={`${id}-help`}
            onValueChange={(next) => {
              const position = Array.isArray(next) ? next[0] : next;
              if (typeof position === "number") onChange(position);
            }}
          />
        </div>
        <span
          aria-hidden
          className={clsx(
            "w-14 shrink-0 text-right text-xs text-muted-foreground",
          )}
        >
          {ends[1]}
        </span>
      </div>
    </div>
  );
};

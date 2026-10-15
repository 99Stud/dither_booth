import type { FC } from "react";

import { Monitor, Moon, Sun } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "#components/ui/toggle-group";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const satisfies ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: unknown;
}>;

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === "string" &&
  (THEME_PREFERENCES as readonly string[]).includes(value);

/**
 * Light / Dark / System segmented control, as in Vercel's and Linear's
 * settings. Controlled: admin wires it to next-themes, the Darkroom to its
 * own preference.
 */
export const ThemeToggle: FC<{
  value: ThemePreference;
  onValueChange: (value: ThemePreference) => void;
  className?: string;
}> = ({ value, onValueChange, className }) => (
  <ToggleGroup
    aria-label="Theme"
    className={className}
    size="sm"
    spacing={0}
    value={[value]}
    variant="outline"
    onValueChange={(next) => {
      // A segmented control always has one value: ignore a click that would
      // unselect the current one.
      const [selected] = next;
      if (isThemePreference(selected)) onValueChange(selected);
    }}
  >
    {OPTIONS.map(({ value: option, label, Icon }) => (
      <ToggleGroupItem key={option} aria-label={label} value={option}>
        <Icon />
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

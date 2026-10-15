import type { FC } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import {
  isThemePreference,
  THEME_PREFERENCES,
} from "@dither-booth/ui/components/misc/ThemeToggle";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * The theme on a phone, where the sidebar's toggle is out of reach: a round
 * Liquid Glass button in the top bar, as iOS 26 places bar buttons.
 */
export const AppThemeMenu: FC = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Theme"
            className="rounded-full glass"
          />
        }
      >
        {resolvedTheme === "dark" ? <Moon /> : <Sun />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup
          value={isThemePreference(theme) ? theme : "system"}
          onValueChange={(value) => {
            if (isThemePreference(value)) setTheme(value);
          }}
        >
          {THEME_PREFERENCES.map((preference) => (
            <DropdownMenuRadioItem key={preference} value={preference}>
              {capitalize(preference)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

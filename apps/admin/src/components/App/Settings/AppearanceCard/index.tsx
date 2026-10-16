import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { isThemePreference } from "@dither-booth/ui/components/misc/ThemeToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import clsx from "clsx";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const THEME_OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Automatic", Icon: Monitor },
] as const;

/**
 * Light, dark or following the device, as iOS's Display settings offer it:
 * three tiles, one picked. Remembered in this browser only.
 */
export const AppearanceCard = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="sky">
            <Palette />
          </IconBubble>
          <h2>Appearance</h2>
        </CardTitle>
        <CardDescription>On this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          aria-label="Theme"
          className={clsx("grid w-full grid-cols-3")}
          spacing={2}
          variant="outline"
          value={[isThemePreference(theme) ? theme : "system"]}
          onValueChange={(next: unknown[]) => {
            const [selected] = next;
            if (isThemePreference(selected)) setTheme(selected);
          }}
        >
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className={clsx(
                "h-auto flex-col gap-1.5 rounded-xl py-3 text-sm",
                "data-[pressed]:border-primary data-[pressed]:bg-primary/5",
                "data-[pressed]:text-primary [&_svg:not([class*='size-'])]:size-5",
              )}
            >
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
};

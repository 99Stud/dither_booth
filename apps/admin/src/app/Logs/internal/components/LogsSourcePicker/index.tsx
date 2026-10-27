import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import clsx from "clsx";
import { ChevronsUpDown } from "lucide-react";

interface LogsSourcePickerProps {
  /** The source shown; `undefined` shows every source. */
  selected?: string;
  /** The sources seen so far. */
  sources: string[];
  onChange: (source: string | undefined) => void;
  className?: string;
}

const ALL_SOURCES = "";

/**
 * Picks one log source, such as `engine.printer`, from those seen so far.
 * A source from a shared link is listed even before any of its lines.
 */
export const LogsSourcePicker: FC<LogsSourcePickerProps> = ({
  selected,
  sources,
  onChange,
  className,
}) => {
  const options =
    selected && !sources.includes(selected)
      ? [...sources, selected].sort()
      : sources;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={clsx("max-w-56 justify-between font-normal", className)}
          />
        }
      >
        <span className="sr-only">Source: </span>
        <span className={clsx("truncate", selected && "font-mono text-xs")}>
          {selected ?? "All sources"}
        </span>
        <ChevronsUpDown className={clsx("text-muted-foreground")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={clsx("w-auto min-w-48")}>
        <DropdownMenuRadioGroup
          value={selected ?? ALL_SOURCES}
          onValueChange={(value: string) =>
            onChange(value === ALL_SOURCES ? undefined : value)
          }
        >
          <DropdownMenuRadioItem value={ALL_SOURCES}>
            All sources
          </DropdownMenuRadioItem>
          {options.length > 0 && <DropdownMenuSeparator />}
          {options.map((source) => (
            <DropdownMenuRadioItem
              key={source}
              value={source}
              className={clsx("font-mono text-xs")}
            >
              {source}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

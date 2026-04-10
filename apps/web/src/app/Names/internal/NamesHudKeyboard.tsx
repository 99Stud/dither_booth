import {
  NAMES_HUD_KEYBOARD_ROWS,
  NAMES_HUD_KEYBOARD_SPACE_KEY,
} from "#app/Names/internal/NamesHudKeyboard.constants.ts";
import { buttonVariants } from "#components/ui/button.tsx";
import { cn } from "#lib/utils.ts";
import { type FC } from "react";

export const NamesHudKeyboard: FC<{
  activeFieldLabel: string;
  disabled?: boolean;
  onBackspace: () => void;
  onKeyPress: (value: string) => void;
}> = (props) => {
  const { activeFieldLabel, disabled = false, onBackspace, onKeyPress } = props;

  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-primary/45 bg-background/95 shadow-[0_-20px_60px_oklch(0_0_0/0.4)] backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-bg opacity-20" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/55 to-transparent"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase sm:text-xs">
          <span className="hud-text-glow-orange tracking-[0.22em] text-primary">
            Clavier
          </span>
          <span className="hud-text-glow-orange-soft tracking-[0.18em] text-muted-foreground">
            {activeFieldLabel}
          </span>
        </div>

        {NAMES_HUD_KEYBOARD_ROWS.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className={cn(
              "grid gap-2",
              row.length === 10 ? "grid-cols-10" : "mx-auto grid-cols-6 w-full max-w-3xl",
            )}
          >
            {row.map((key) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                className={cn(
                  buttonVariants({ variant: "outline", size: "touch" }),
                  "min-h-12 border-primary/50 px-0 text-base tracking-[0.22em] sm:min-h-14 sm:text-lg",
                )}
                onClick={() => {
                  onKeyPress(key);
                }}
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <button
            type="button"
            disabled={disabled}
            className={cn(
              buttonVariants({ variant: "outline", size: "touch" }),
              "min-h-12 border-primary/50 text-sm tracking-[0.18em] sm:min-h-14 sm:text-base",
            )}
            onClick={() => {
              onKeyPress(NAMES_HUD_KEYBOARD_SPACE_KEY);
            }}
          >
            Espace
          </button>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              buttonVariants({ variant: "hud", size: "touch" }),
              "min-h-12 px-4 text-sm tracking-[0.18em] sm:min-h-14 sm:text-base",
            )}
            onClick={onBackspace}
          >
            Effacer
          </button>
        </div>
      </div>
    </div>
  );
};

import {
  NAMES_HUD_KEYBOARD_ROWS,
  NAMES_HUD_KEYBOARD_SPACE_KEY,
} from "#app/Names/internal/NamesHudKeyboard.constants.ts";
import { buttonVariants } from "#components/ui/button.tsx";
import { cn } from "#lib/utils.ts";
import { type FC, type ReactNode } from "react";

const keyOutlinePress =
  "group touch-manipulation transition-[transform,box-shadow,border-color,background-color] duration-100 ease-out active:scale-[0.92] active:translate-y-[3px] active:duration-[70ms] active:border-primary active:bg-primary/18 active:shadow-[0_0_22px_oklch(0.72_0.2_48/0.48),0_0_0_1px_oklch(0.72_0.2_48/0.4),inset_0_1px_0_oklch(0.88_0.12_55/0.15)] motion-reduce:active:scale-100 motion-reduce:active:translate-y-px motion-reduce:transition-none";

const keyHudPress =
  "group touch-manipulation transition-[transform,box-shadow,border-color,background-color] duration-100 ease-out active:scale-[0.94] active:translate-y-[2px] active:duration-[70ms] active:shadow-[0_0_32px_oklch(0.72_0.2_48/0.72),0_0_0_2px_oklch(0.72_0.2_48/0.55),inset_0_0_18px_oklch(0.72_0.2_48/0.22)] active:bg-primary/10 motion-reduce:active:scale-100 motion-reduce:active:translate-y-px motion-reduce:transition-none";

const keyLabelFlash =
  "pointer-events-none inline-block transition-[transform,filter] duration-100 ease-out group-active:scale-105 group-active:brightness-125 group-active:[text-shadow:0_0_12px_oklch(0.82_0.2_55/0.95),0_0_4px_oklch(0.78_0.2_48/0.9)] motion-reduce:group-active:scale-100 motion-reduce:group-active:brightness-100";

const KeyCap: FC<{
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  labelClassName?: string;
  onPress: () => void;
  variant: "hud" | "outline";
}> = (props) => {
  const { children, className, disabled, labelClassName, onPress, variant } = props;
  const isDisabled = disabled ?? false;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={cn(
        buttonVariants({ variant: variant === "outline" ? "outline" : "hud", size: "touch" }),
        variant === "outline" ? keyOutlinePress : keyHudPress,
        className,
      )}
      onClick={onPress}
    >
      <span className={cn(keyLabelFlash, labelClassName)}>{children}</span>
    </button>
  );
};

export const NamesHudKeyboard: FC<{
  activeFieldLabel: string;
  disabled?: boolean;
  onBackspace: () => void;
  onKeyPress: (value: string) => void;
}> = (props) => {
  const { activeFieldLabel, disabled, onBackspace, onKeyPress } = props;
  const isKeyboardDisabled = disabled ?? false;

  return (
    <div
      id="names-hud-keyboard"
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-primary/45 bg-background/70 shadow-[0_-20px_60px_oklch(0_0_0/0.4)] backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-bg opacity-20" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/55 to-transparent"
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 [@media(max-height:720px)]:gap-1.5 [@media(max-height:720px)]:py-2.5">
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase sm:text-xs [@media(max-height:720px)]:text-[9px]">
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
              "grid gap-1.5 sm:gap-2 [@media(max-height:720px)]:gap-1",
              row.length === 10 ? "grid-cols-10" : "mx-auto grid-cols-6 w-full max-w-3xl",
            )}
          >
            {row.map((key) => (
              <KeyCap
                key={key}
                disabled={isKeyboardDisabled}
                variant="outline"
                className="min-h-11 border-primary/50 px-0 text-sm tracking-[0.22em] sm:min-h-14 sm:text-lg [@media(max-height:720px)]:min-h-9 [@media(max-height:720px)]:text-xs"
                onPress={() => {
                  onKeyPress(key);
                }}
              >
                {key}
              </KeyCap>
            ))}
          </div>
        ))}

        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-1.5 sm:gap-2 [@media(max-height:720px)]:gap-1">
          <KeyCap
            disabled={isKeyboardDisabled}
            variant="outline"
            className="min-h-11 border-primary/50 text-sm tracking-[0.18em] sm:min-h-14 sm:text-base [@media(max-height:720px)]:min-h-9 [@media(max-height:720px)]:text-xs"
            onPress={() => {
              onKeyPress(NAMES_HUD_KEYBOARD_SPACE_KEY);
            }}
          >
            Espace
          </KeyCap>
          <KeyCap
            disabled={isKeyboardDisabled}
            variant="hud"
            className="min-h-11 px-4 text-sm tracking-[0.18em] sm:min-h-14 sm:text-base [@media(max-height:720px)]:min-h-9 [@media(max-height:720px)]:text-xs"
            onPress={onBackspace}
          >
            Effacer
          </KeyCap>
        </div>
      </div>
    </div>
  );
};

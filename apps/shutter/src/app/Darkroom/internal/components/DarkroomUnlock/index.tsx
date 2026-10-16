import type { FC, ReactNode } from "react";

import { logKioskEvent } from "@dither-booth/logging";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { haptic } from "@dither-booth/ui/haptics";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { ArrowLeft, Delete, LockKeyhole } from "lucide-react";
import { useState } from "react";

import { setDarkroomSession } from "#lib/darkroom/darkroom-token";
import { useTRPC } from "#lib/trpc/trpc.client";

import { DARKROOM_LOG_SOURCE } from "../../Darkroom.constants";
import { getTRPCErrorCode, getUnlockErrorMessage } from "../../Darkroom.utils";

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const KeypadKey: FC<{
  label: string;
  children: ReactNode;
  disabled?: boolean;
  variant?: "digit" | "action";
  onPress: () => void;
}> = ({ label, children, disabled, variant = "digit", onPress }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      // Each key clicks under the finger, like the iPad's passcode pad.
      haptic("light");
      onPress();
    }}
    className={clsx(
      "size-20 rounded-full",
      "flex items-center justify-center",
      "text-3xl font-light tabular-nums",
      "touch-manipulation transition-colors select-none",
      "disabled:opacity-30",
      variant === "digit"
        ? "bg-muted text-foreground active:bg-accent"
        : "bg-transparent text-foreground active:bg-muted",
    )}
  >
    {children}
  </button>
);

/**
 * The PIN screen in front of the Darkroom, laid out like an iPad lock
 * screen: dots for the digits typed and a big on-screen keypad, so staff
 * never need the system keyboard. Dark, like the booth around it.
 */
export const DarkroomUnlock: FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutateAsync: unlockDarkroom, isPending } = useMutation(
    trpc.booth.unlockDarkroom.mutationOptions(),
  );

  const pressDigit = (digit: string) => {
    setErrorMessage(null);
    setPin((current) =>
      current.length < PIN_MAX_LENGTH ? current + digit : current,
    );
  };

  const unlock = async () => {
    if (pin.length < PIN_MIN_LENGTH || isPending) return;
    setErrorMessage(null);

    try {
      setDarkroomSession(await unlockDarkroom({ pin }));
      haptic("success");
      logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-unlocked");
    } catch (error) {
      haptic("error");
      setErrorMessage(
        getUnlockErrorMessage(
          getTRPCErrorCode(error),
          error instanceof Error ? error.message : undefined,
        ),
      );
    } finally {
      setPin("");
    }
  };

  return (
    <div
      className={clsx(
        "relative min-h-dvh bg-background text-foreground",
        "flex flex-col items-center justify-center gap-8 p-6",
        "select-none",
      )}
    >
      <button
        type="button"
        onClick={() => void navigate({ to: "/" })}
        className={clsx(
          "absolute top-6 left-6",
          "flex items-center gap-2",
          "text-sm font-medium text-muted-foreground active:text-foreground",
        )}
      >
        <ArrowLeft className="size-5" />
        Back to booth
      </button>

      <div className={clsx("flex flex-col items-center gap-3 text-center")}>
        <span
          className={clsx(
            "flex size-12 items-center justify-center",
            "rounded-2xl bg-primary text-primary-foreground",
          )}
        >
          <LockKeyhole className="size-5" />
        </span>
        <h1 className={clsx("text-2xl font-semibold tracking-tight")}>
          Darkroom
        </h1>
        <p className={clsx("text-sm text-muted-foreground")}>
          Enter the PIN to tune the print
        </p>
      </div>

      <div className={clsx("flex h-6 flex-col items-center gap-4")}>
        <div
          aria-label={`${pin.length} digits entered`}
          className={clsx("flex gap-4")}
          role="status"
        >
          {Array.from(
            { length: Math.max(PIN_MIN_LENGTH, pin.length) },
            (_, index) => (
              <span
                key={index}
                className={clsx(
                  "size-3.5 rounded-full border border-foreground/70",
                  "transition-colors",
                  index < pin.length && "bg-foreground",
                )}
              />
            ),
          )}
        </div>
      </div>

      <p
        className={clsx("h-5 text-sm font-medium text-destructive")}
        role={errorMessage ? "alert" : undefined}
      >
        {errorMessage}
      </p>

      <div className={clsx("grid grid-cols-3 gap-x-7 gap-y-5")}>
        {DIGIT_KEYS.map((digit) => (
          <KeypadKey
            key={digit}
            label={digit}
            disabled={isPending}
            onPress={() => pressDigit(digit)}
          >
            {digit}
          </KeypadKey>
        ))}
        <KeypadKey
          label="Delete"
          variant="action"
          disabled={isPending || pin.length === 0}
          onPress={() => setPin((current) => current.slice(0, -1))}
        >
          <Delete className="size-7" />
        </KeypadKey>
        <KeypadKey
          label="0"
          disabled={isPending}
          onPress={() => pressDigit("0")}
        >
          0
        </KeypadKey>
        <KeypadKey
          label="Unlock"
          variant="action"
          disabled={isPending || pin.length < PIN_MIN_LENGTH}
          onPress={() => void unlock()}
        >
          {isPending ? (
            <Spinner className="size-6" />
          ) : (
            <span className={clsx("text-lg font-medium")}>OK</span>
          )}
        </KeypadKey>
      </div>
    </div>
  );
};

import type { FC, FormEvent } from "react";

import { logKioskEvent } from "@dither-booth/logging";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { useState } from "react";

import { setDarkroomSession } from "#lib/darkroom/darkroom-token";
import { useTRPC } from "#lib/trpc/trpc.client";

import { DARKROOM_LOG_SOURCE } from "../../Darkroom.constants";
import { getTRPCErrorCode, getUnlockErrorMessage } from "../../Darkroom.utils";

/** The PIN screen in front of the Darkroom. */
export const DarkroomUnlock: FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { mutateAsync: unlockDarkroom, isPending } = useMutation(
    trpc.booth.unlockDarkroom.mutationOptions(),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    try {
      setDarkroomSession(await unlockDarkroom({ pin }));
      logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-unlocked");
    } catch (error) {
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
        "min-h-dvh bg-background p-6",
        "flex items-center justify-center",
      )}
    >
      <Card className={clsx("w-full max-w-sm")}>
        <CardHeader>
          <CardTitle>Darkroom</CardTitle>
          <CardDescription>
            Print tuning for staff. Enter the Darkroom PIN set in admin&apos;s
            Control Center.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className={clsx("flex flex-col gap-3")} onSubmit={submit}>
            <Input
              aria-label="Darkroom PIN"
              autoComplete="off"
              autoFocus
              inputMode="numeric"
              maxLength={8}
              placeholder="PIN"
              type="password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
            />
            {errorMessage && (
              <p className={clsx("text-sm text-destructive")} role="alert">
                {errorMessage}
              </p>
            )}
            <div className={clsx("flex justify-between gap-2")}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: "/" })}
              >
                Back to booth
              </Button>
              <Button type="submit" disabled={isPending || pin.length < 4}>
                {isPending ? <Spinner className="size-4" /> : "Unlock"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

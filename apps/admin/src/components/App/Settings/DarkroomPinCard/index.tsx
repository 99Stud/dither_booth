import type { FormEvent } from "react";

import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Input } from "@dither-booth/ui/components/ui/input";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { KeyRound, LockKeyhole } from "lucide-react";
import { useState } from "react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useLockAdmin } from "#lib/staff-session/useStaffSession";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Sets the staff PIN: it opens admin, and the Darkroom (print tuning) on
 * the booth screen. Changing it signs everyone out, this page included.
 */
export const DarkroomPinCard = () => {
  const trpc = useTRPC();
  const lockAdmin = useLockAdmin();
  const [pin, setPin] = useState("");
  const pinStatusQuery = useQuery(
    trpc.config.getDarkroomPinStatus.queryOptions(),
  );
  const { mutateAsync: setDarkroomPin, isPending } = useMutation(
    trpc.config.setDarkroomPin.mutationOptions(),
  );
  const pinStatus = pinStatusQuery.data;
  const isPinValid = darkroomPinSchema.safeParse(pin).success;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isPinValid) return;

    const saved = await setDarkroomPin({ pin }).catch((error: unknown) => {
      reportKioskError(error, {
        event: "settings-darkroom-pin-failed",
        source: SETTINGS_LOG_SOURCE,
        userMessage: "Failed to save the staff PIN.",
      });
    });

    if (!saved) return;

    setPin("");
    notify.success("Staff PIN saved. Everyone was signed out: sign in again.");
    // The engine signed this page out too.
    await lockAdmin();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="violet">
            <KeyRound />
          </IconBubble>
          <h2>Staff PIN</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className={clsx("flex flex-col gap-2")} onSubmit={submit}>
          <div className={clsx("flex gap-2")}>
            <Input
              aria-label="New staff PIN"
              autoComplete="off"
              enterKeyHint="done"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="4 to 8 digits"
              type="password"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
            />
            <Button type="submit" disabled={!isPinValid || isPending}>
              {isPending ? (
                <Spinner className="size-4" />
              ) : (
                <>
                  <LockKeyhole data-icon="inline-start" />
                  {pinStatus?.isSet ? "Change PIN" : "Set PIN"}
                </>
              )}
            </Button>
          </div>
          <p className={clsx("text-sm text-muted-foreground")}>
            Opens admin and the Darkroom.{" "}
            {pinStatus?.isSet && pinStatus.updatedAt
              ? `Changed ${format(new Date(pinStatus.updatedAt), "MMM d, HH:mm")}.`
              : null}
          </p>
          <Button
            className={clsx("self-start")}
            type="button"
            variant="outline"
            onClick={() => void lockAdmin()}
          >
            <LockKeyhole data-icon="inline-start" />
            Lock admin
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

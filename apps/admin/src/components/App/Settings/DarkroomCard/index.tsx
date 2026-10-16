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
import { Label } from "@dither-booth/ui/components/ui/label";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { LockKeyhole, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

import { KioskScreenToggle } from "./internal/components/KioskScreenToggle";

/**
 * The Darkroom (print tuning on the booth iPad), from one place: which
 * screen the kiosk shows, to open the Darkroom on it and send it back, and
 * the PIN staff type there. Until a PIN is set, the Darkroom stays locked.
 */
export const DarkroomCard = () => {
  const trpc = useTRPC();
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
        userMessage: "Failed to save the Darkroom PIN.",
      });
    });

    if (!saved) return;

    setPin("");
    await pinStatusQuery.refetch();
    notify.success(
      "Darkroom PIN saved. Open Darkroom sessions were signed out.",
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="violet">
            <SlidersHorizontal />
          </IconBubble>
          <h2>Darkroom</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-5")}>
        <KioskScreenToggle isPinSet={pinStatus?.isSet ?? false} />
        <form className={clsx("flex flex-col gap-2")} onSubmit={submit}>
          <Label htmlFor="darkroom-pin">PIN</Label>
          <div className={clsx("flex gap-2")}>
            <Input
              id="darkroom-pin"
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
            {pinStatus === undefined
              ? "Checking…"
              : pinStatus.isSet && pinStatus.updatedAt
                ? `Changed ${format(new Date(pinStatus.updatedAt), "MMM d, HH:mm")}.`
                : "No PIN yet: the Darkroom stays locked."}
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

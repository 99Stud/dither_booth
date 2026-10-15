import type { FormEvent } from "react";

import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Sets the PIN staff type to open the Darkroom (print tuning) on the booth
 * iPad. Until one is set, the Darkroom stays locked.
 */
export const DarkroomPinCard = () => {
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
        event: "control-center-darkroom-pin-failed",
        source: CONTROL_CENTER_LOG_SOURCE,
        userMessage: "Failed to save the Darkroom PIN.",
      });
    });

    if (!saved) return;

    setPin("");
    await pinStatusQuery.refetch();
    toast.success(
      "Darkroom PIN saved. Open Darkroom sessions were signed out.",
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Darkroom PIN</h2>
        </CardTitle>
        <CardDescription>
          {pinStatus === undefined
            ? "Checking…"
            : pinStatus.isSet && pinStatus.updatedAt
              ? `Set, last changed ${format(new Date(pinStatus.updatedAt), "MM/dd/yyyy HH:mm")}. Staff tap the top-left logo of the booth screen 4 times to open the Darkroom.`
              : "Not set: the Darkroom is locked. Set a PIN so staff can tune the print on the booth."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className={clsx("flex gap-2")} onSubmit={submit}>
          <Input
            aria-label="New Darkroom PIN"
            autoComplete="off"
            inputMode="numeric"
            maxLength={8}
            placeholder="4 to 8 digits"
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          />
          <Button type="submit" disabled={!isPinValid || isPending}>
            {isPending ? (
              <Spinner className="size-4" />
            ) : pinStatus?.isSet ? (
              "Change PIN"
            ) : (
              "Set PIN"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

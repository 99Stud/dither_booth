import type { FormEvent } from "react";

import {
  REGISTRATION_CODE_MAX_TYPED_LENGTH,
  registrationCodeSchema,
} from "@dither-booth/protocol/registration";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
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
import { Cloud, Link2 } from "lucide-react";
import { useState } from "react";

import { SETTINGS_LOG_SOURCE } from "#app/Settings/internal/Settings.constants";
import { errorMessage } from "#lib/feedback/error-message";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * Registers the booth with the Hub, where its alerts reach staff phones.
 * Staff get a registration code in the Studio app and type it here, once per booth.
 */
export const HubCard = () => {
  const trpc = useTRPC();
  const [code, setCode] = useState("");
  const [isForgetOpen, setIsForgetOpen] = useState(false);
  // Polled, so the last report and any error stay current.
  const registrationQuery = useQuery({
    ...trpc.config.getHubRegistration.queryOptions(),
    refetchInterval: 10_000,
  });
  const { mutateAsync: registerWithHub, isPending: isRegistering } =
    useMutation(trpc.config.registerWithHub.mutationOptions());
  const { mutateAsync: forgetHubRegistration, isPending: isForgetting } =
    useMutation(trpc.config.forgetHubRegistration.mutationOptions());
  const registration = registrationQuery.data;
  const isCodeValid = registrationCodeSchema.safeParse(code).success;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isCodeValid) return;

    const registered = await registerWithHub({ code }).catch(
      (error: unknown) => {
        reportKioskError(error, {
          event: "settings-hub-register-failed",
          source: SETTINGS_LOG_SOURCE,
          userMessage: errorMessage(error, "Couldn't register the booth."),
        });
      },
    );
    // A failure may also have forgotten an earlier registration.
    await registrationQuery.refetch();
    if (!registered) return;

    setCode("");
    notify.success(`Registered with the Hub as ${registered.boothName}.`);
  };

  const forget = async () => {
    const forgotten = await forgetHubRegistration()
      .then(() => true)
      .catch((error: unknown) => {
        reportKioskError(error, {
          event: "settings-hub-forget-failed",
          source: SETTINGS_LOG_SOURCE,
          userMessage: "Couldn't forget the registration.",
        });
        return false;
      });
    setIsForgetOpen(false);
    if (!forgotten) return;
    await registrationQuery.refetch();
    notify.success("The booth no longer reports to the Hub.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="sky">
            <Cloud />
          </IconBubble>
          <h2>Hub</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-3")}>
        <p className={clsx("text-sm text-muted-foreground")}>
          {registration === undefined
            ? "Checking…"
            : registration.registered
              ? `Registered as ${registration.boothName} since ${format(new Date(registration.registeredAt), "MMM d, HH:mm")}.`
              : "Not registered: the Hub can't alert staff about this booth."}
        </p>
        {registration?.registered ? (
          <p
            role="status"
            className={clsx(
              "text-sm",
              registration.report.lastError
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {registration.report.lastError
              ? `Can't report: ${registration.report.lastError}`
              : registration.report.lastReportedAt
                ? `Last report ${format(new Date(registration.report.lastReportedAt), "HH:mm:ss")}.`
                : "No report yet."}
          </p>
        ) : null}
        <form className={clsx("flex flex-col gap-2")} onSubmit={submit}>
          <div className={clsx("flex gap-2")}>
            <Input
              aria-label="One-time code from the Hub"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="go"
              maxLength={REGISTRATION_CODE_MAX_TYPED_LENGTH}
              placeholder="7KQ2M-9XD4T"
              spellCheck={false}
              className={clsx("font-mono uppercase")}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button type="submit" disabled={!isCodeValid || isRegistering}>
              {isRegistering ? (
                <Spinner className="size-4" />
              ) : (
                <>
                  <Link2 data-icon="inline-start" />
                  {registration?.registered ? "Register again" : "Register"}
                </>
              )}
            </Button>
          </div>
          <p className={clsx("text-sm text-muted-foreground")}>
            Get a registration code in the Studio app (Booths). It works once, for 24 hours.
          </p>
        </form>
        {registration?.registered ? (
          <Button
            type="button"
            variant="outline"
            className={clsx("self-start")}
            disabled={isForgetting}
            onClick={() => setIsForgetOpen(true)}
          >
            Forget the registration
          </Button>
        ) : null}
      </CardContent>

      <AlertDialog open={isForgetOpen} onOpenChange={setIsForgetOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Forget the registration?</AlertDialogTitle>
            <AlertDialogDescription>
              The booth stops reporting, so staff get no alert about it. The Hub
              still lists it as registered. To register it again, ask for a new
              code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void forget()}
            >
              Forget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

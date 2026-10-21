import type { FormEvent } from "react";

import { registrationCodeSchema } from "@dither-booth/protocol/registration";
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
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

/** The engine's own explanation (bad code, no internet) when it gave one. */
const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Registers the booth with the Hub, where its alerts reach staff phones.
 * Staff issue a one-time code on the Hub and type it here, once per booth.
 */
export const HubCard = () => {
  const trpc = useTRPC();
  const [code, setCode] = useState("");
  const [isForgetOpen, setIsForgetOpen] = useState(false);
  const linkQuery = useQuery(trpc.config.getHubLink.queryOptions());
  const { mutateAsync: linkToHub, isPending: isLinking } = useMutation(
    trpc.config.linkToHub.mutationOptions(),
  );
  const { mutateAsync: unlinkFromHub, isPending: isUnlinking } = useMutation(
    trpc.config.unlinkFromHub.mutationOptions(),
  );
  const link = linkQuery.data;
  const isCodeValid = registrationCodeSchema.safeParse(code).success;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isCodeValid) return;

    const linked = await linkToHub({ code }).catch((error: unknown) => {
      reportKioskError(error, {
        event: "settings-hub-link-failed",
        source: SETTINGS_LOG_SOURCE,
        userMessage: messageOf(error, "Couldn't register the booth."),
      });
    });
    if (!linked?.linked) return;

    setCode("");
    await linkQuery.refetch();
    notify.success(`Registered with the Hub as ${linked.boothName}.`);
  };

  const forget = async () => {
    const done = await unlinkFromHub().catch((error: unknown) => {
      reportKioskError(error, {
        event: "settings-hub-unlink-failed",
        source: SETTINGS_LOG_SOURCE,
        userMessage: "Couldn't forget the Hub.",
      });
    });
    setIsForgetOpen(false);
    if (!done) return;
    await linkQuery.refetch();
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
          {link === undefined
            ? "Checking…"
            : link.linked
              ? `Registered as ${link.boothName} since ${format(new Date(link.linkedAt), "MMM d, HH:mm")}.`
              : "Not registered: the Hub can't alert staff about this booth."}
        </p>
        <form className={clsx("flex flex-col gap-2")} onSubmit={submit}>
          <div className={clsx("flex gap-2")}>
            <Input
              aria-label="One-time code from the Hub"
              autoCapitalize="characters"
              autoComplete="off"
              enterKeyHint="go"
              maxLength={16}
              placeholder="7KQ2M-9XD4T"
              spellCheck={false}
              className={clsx("font-mono uppercase")}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button type="submit" disabled={!isCodeValid || isLinking}>
              {isLinking ? (
                <Spinner className="size-4" />
              ) : (
                <>
                  <Link2 data-icon="inline-start" />
                  {link?.linked ? "Register again" : "Register"}
                </>
              )}
            </Button>
          </div>
          <p className={clsx("text-sm text-muted-foreground")}>
            Ask for a one-time code on the Hub. It works once, for 24 hours.
          </p>
        </form>
        {link?.linked ? (
          <Button
            type="button"
            variant="outline"
            className={clsx("self-start")}
            disabled={isUnlinking}
            onClick={() => setIsForgetOpen(true)}
          >
            Forget the Hub
          </Button>
        ) : null}
      </CardContent>

      <AlertDialog open={isForgetOpen} onOpenChange={setIsForgetOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Forget the Hub?</AlertDialogTitle>
            <AlertDialogDescription>
              The booth stops reporting, so staff get no alert about it. To
              register it again, ask for a new code.
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

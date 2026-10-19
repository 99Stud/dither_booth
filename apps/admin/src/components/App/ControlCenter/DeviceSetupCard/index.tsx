import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Copy, Printer, Tablet } from "lucide-react";
import { useMemo } from "react";
import { renderSVG } from "uqr";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * How another iPad or a staff phone gets in: scan the QR here, or print it
 * for someone at the booth. The page behind it trusts the booth and opens
 * the Shutter.
 */
export const DeviceSetupCard = () => {
  const trpc = useTRPC();
  const setupQuery = useQuery(trpc.config.getDeviceSetup.queryOptions());
  const printMutation = useMutation(
    trpc.config.printSetupTicket.mutationOptions(),
  );
  const setupUrl = setupQuery.data?.setupUrl;
  // Black on white in both themes: phones read a dark-on-light code best.
  const qrSrc = useMemo(
    () =>
      setupUrl
        ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(setupUrl, { border: 2 }))}`
        : undefined,
    [setupUrl],
  );

  const copyUrl = async () => {
    if (!setupUrl) return;
    await navigator.clipboard.writeText(setupUrl).then(
      () => notify.success("Setup link copied."),
      () => notify.error("Couldn't copy the link."),
    );
  };

  const printTicket = async () => {
    const printed = await printMutation.mutateAsync().then(
      () => true,
      (error: unknown) => {
        reportKioskError(error, {
          event: "control-center-setup-ticket-failed",
          source: CONTROL_CENTER_LOG_SOURCE,
          userMessage: "Couldn't print the setup ticket. Check the printer.",
        });
        return false;
      },
    );
    if (printed) notify.success("Setup ticket printed.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="sky">
            <Tablet />
          </IconBubble>
          <h2>Connect a device</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4 sm:flex-row")}>
        {qrSrc ? (
          <img
            src={qrSrc}
            alt={`QR code for ${setupUrl}`}
            className={clsx("size-36 shrink-0 rounded-lg")}
          />
        ) : (
          <div
            aria-hidden
            className={clsx(
              "size-36 shrink-0 animate-pulse rounded-lg bg-muted",
            )}
          />
        )}
        <div className={clsx("flex min-w-0 flex-col gap-3")}>
          <p className={clsx("text-sm text-muted-foreground")}>
            Scan with the iPad camera. A new device is walked through trusting
            the booth once; one that already trusts it goes straight to the
            Shutter.
          </p>
          {setupQuery.isError ? (
            <p className={clsx("text-sm text-destructive")}>
              No booth address yet. Run <code>booth cert</code> on the booth.
            </p>
          ) : (
            <p className={clsx("truncate font-mono text-sm")}>
              {setupUrl ?? "…"}
            </p>
          )}
          <div className={clsx("flex flex-wrap gap-2")}>
            <Button
              size="sm"
              variant="outline"
              disabled={!setupUrl}
              onClick={() => void copyUrl()}
            >
              <Copy />
              Copy link
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!setupUrl || printMutation.isPending}
              onClick={() => void printTicket()}
            >
              <Printer />
              {printMutation.isPending ? "Printing…" : "Print setup ticket"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

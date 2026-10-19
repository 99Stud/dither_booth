import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  WIFI_MODE_LABEL,
  wifiSignalLabel,
} from "@dither-booth/ui/components/misc/WifiCard";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Copy, Printer, Wifi } from "lucide-react";
import { useMemo } from "react";
import { renderSVG } from "uqr";

import { CONTROL_CENTER_LOG_SOURCE } from "#app/ControlCenter/internal/ControlCenter.constants";
import { notify } from "#lib/feedback/notify";
import { reportKioskError } from "#lib/logging/logging.utils";
import { useTRPC } from "#lib/trpc/trpc.client";

const STATUS_POLL_MS = 15_000;

/**
 * What the booth is on, and how another iPad or a staff phone gets in: scan
 * the QR here, or print it for someone at the booth. Changing the Wi-Fi is
 * in Settings.
 */
export const NetworkCard = () => {
  const trpc = useTRPC();
  const setupQuery = useQuery(trpc.config.getDeviceSetup.queryOptions());
  const statusQuery = useQuery(
    trpc.config.getNetworkStatus.queryOptions(undefined, {
      refetchInterval: STATUS_POLL_MS,
    }),
  );
  const printMutation = useMutation(
    trpc.config.printSetupTicket.mutationOptions(),
  );
  const setupUrl = setupQuery.data?.setupUrl;
  const localSetupUrl = setupQuery.data?.localSetupUrl;
  const status = statusQuery.data?.available ? statusQuery.data : undefined;
  const onBoothWifi = status?.mode === "hotspot";
  const signal = status?.nearby.find((network) => network.inUse)?.signal;
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
        <CardTitle
          className={clsx("flex items-center justify-between gap-2.5")}
        >
          <span className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="sky">
              <Wifi />
            </IconBubble>
            <h2>Network</h2>
          </span>
          {status && (
            <Badge variant="secondary">{WIFI_MODE_LABEL[status.mode]}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        <div className={clsx("flex items-start justify-between gap-4 text-sm")}>
          <dl className={clsx("grid min-w-0 grid-cols-[auto_1fr] gap-x-3")}>
            {status?.ssid && (
              <>
                <dt className={clsx("text-muted-foreground")}>
                  {onBoothWifi ? "Booth Wi-Fi" : "Wi-Fi"}
                </dt>
                <dd className={clsx("truncate")}>
                  {status.ssid}
                  {signal !== undefined && !onBoothWifi && (
                    <span className={clsx("text-muted-foreground")}>
                      {" "}
                      · {wifiSignalLabel(signal)}
                    </span>
                  )}
                </dd>
              </>
            )}
            {setupQuery.data && (
              <>
                <dt className={clsx("text-muted-foreground")}>Address</dt>
                <dd className={clsx("truncate font-mono")}>
                  {setupQuery.data.ip}
                </dd>
              </>
            )}
            {statusQuery.data && !statusQuery.data.available && (
              <dd className={clsx("col-span-2 text-muted-foreground")}>
                This machine manages its own Wi-Fi.
              </dd>
            )}
          </dl>
          {statusQuery.data?.available && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to="/settings" />}
            >
              Change Wi-Fi
            </Button>
          )}
        </div>
        {onBoothWifi && (
          <p className={clsx("text-sm text-muted-foreground")}>
            {status.boothWifiChosen
              ? "Running the event on the booth's own Wi-Fi."
              : "No known network around. Pick the venue's in Settings."}
          </p>
        )}

        <Separator />

        <div className={clsx("flex flex-col gap-4 sm:flex-row")}>
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
            <h3 className={clsx("text-sm font-medium")}>Connect a device</h3>
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
              <div className={clsx("flex min-w-0 flex-col gap-1")}>
                <p className={clsx("truncate font-mono text-sm")}>
                  {setupUrl ?? "…"}
                </p>
                {localSetupUrl && (
                  <p className={clsx("text-sm text-muted-foreground")}>
                    Page doesn't open? Try{" "}
                    <span className={clsx("font-mono break-all")}>
                      {localSetupUrl}
                    </span>
                  </p>
                )}
              </div>
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
        </div>
      </CardContent>
    </Card>
  );
};

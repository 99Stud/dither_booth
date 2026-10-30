import type { ReactNode } from "react";

import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { Bell, BellOff, BellRing, Send, Share, SquarePlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  currentSubscription,
  deviceSupport,
  isKnownToHub,
  readBrowserTraits,
  sendTest,
  turnOff,
  turnOn,
} from "#lib/device";
import { messageOf } from "#lib/errors";
import { NOT_IN_A_TEAM, staffOrgId } from "#lib/team";

/** Where this device stands, from "can't" to "gets the alerts". */
type DeviceState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "needs-home-screen" }
  | { kind: "not-staff" }
  | { kind: "blocked" }
  | { kind: "off"; orgId: string }
  | { kind: "on"; orgId: string };

async function readState(): Promise<DeviceState> {
  const support = deviceSupport(readBrowserTraits());
  if (support !== "ready") return { kind: support };
  const orgId = await staffOrgId();
  if (!orgId) return { kind: "not-staff" };
  if (Notification.permission === "denied") return { kind: "blocked" };
  const subscription = await currentSubscription();
  return subscription && (await isKnownToHub(subscription.endpoint))
    ? { kind: "on", orgId }
    : { kind: "off", orgId };
}

const Step = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <li className={clsx("flex items-start gap-3 text-sm")}>
    <span
      className={clsx("mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4")}
    >
      {icon}
    </span>
    <span>{children}</span>
  </li>
);

/** This device's notifications: turn them on, test them, turn them off. */
export const DeviceCard = ({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) => {
  const [state, setState] = useState<DeviceState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const isAppleMobile = readBrowserTraits().isAppleMobile;

  const refresh = useCallback(() => {
    readState().then(setState, (error: unknown) => {
      toast.error(`Couldn't check this device: ${messageOf(error)}`);
      setState({ kind: "unsupported" });
    });
  }, []);

  useEffect(refresh, [refresh]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const on = state.kind === "on";

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone={on ? "emerald" : "zinc"}>
            {on ? <BellRing /> : <Bell />}
          </IconBubble>
          This device
        </CardTitle>
        <CardDescription>Signed in as {email}.</CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-4")}>
        {state.kind === "checking" ? <Spinner className="size-5" /> : null}

        {state.kind === "unsupported" ? (
          <p className={clsx("text-sm")}>
            This browser can't get notifications. Use Studio on an iPhone or
            iPad from the Home Screen, or in Chrome, Edge or Firefox.
          </p>
        ) : null}

        {state.kind === "needs-home-screen" ? (
          <div className={clsx("flex flex-col gap-3")}>
            <p className={clsx("text-sm")}>
              On iPhone and iPad, alerts only reach Studio from the Home Screen.
            </p>
            <ol className={clsx("flex flex-col gap-2")}>
              <Step icon={<Share />}>Tap Share in Safari's toolbar.</Step>
              <Step icon={<SquarePlus />}>Choose Add to Home Screen.</Step>
              <Step icon={<Bell />}>
                Open Studio from the Home Screen and sign in there.
              </Step>
            </ol>
          </div>
        ) : null}

        {state.kind === "not-staff" ? (
          <p className={clsx("text-sm")}>{NOT_IN_A_TEAM}</p>
        ) : null}

        {state.kind === "blocked" ? (
          <p className={clsx("text-sm")}>
            Notifications are turned off for Studio on this device. Turn them on
            in the device's settings (on iPhone: Settings, Notifications,
            Studio), then open Studio again.
          </p>
        ) : null}

        {state.kind === "off" ? (
          <div className={clsx("flex flex-col gap-3")}>
            <p className={clsx("text-sm")}>
              Get an alert here when a booth runs out of paper, has a printer
              problem, or goes silent.
            </p>
            <Button
              type="button"
              disabled={busy}
              // turnOn asks for permission first thing: iOS only shows the
              // prompt in direct answer to a tap.
              onClick={() =>
                void act(() => turnOn({ orgId: state.orgId, userId }))
              }
            >
              {busy ? (
                <Spinner className="size-4" />
              ) : (
                <Bell data-icon="inline-start" />
              )}
              Turn on notifications
            </Button>
          </div>
        ) : null}

        {on ? (
          <div className={clsx("flex flex-col gap-3")}>
            <p className={clsx("text-sm")}>
              This device gets the booths' alerts.
            </p>
            {isAppleMobile ? (
              <p className={clsx("text-sm text-muted-foreground")}>
                A Focus mode can hold alerts back: allow Studio in your Focus
                settings so they always get through.
              </p>
            ) : null}
            <div className={clsx("flex flex-wrap gap-2")}>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const { sent } = await sendTest();
                    if (sent > 0)
                      toast.success(
                        sent === 1
                          ? "Test sent to this device."
                          : `Test sent to ${sent} devices.`,
                      );
                    else
                      toast.error(
                        "No device got the test. Turn notifications off and on again.",
                      );
                  })
                }
              >
                <Send data-icon="inline-start" />
                Send test notification
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void act(turnOff)}
              >
                <BellOff data-icon="inline-start" />
                Turn off
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

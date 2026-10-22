import { alertWording } from "@dither-booth/protocol/alerts";
import {
  IconBubble,
  type IconBubbleTone,
} from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CircleCheck,
  Hand,
  type LucideIcon,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Live } from "#lib/live";

import { LiveFallback } from "#app/LiveFallback";
import { acknowledge, type AlertRow, sortAlerts } from "#lib/alerts";
import { messageOf } from "#lib/errors";

const ago = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

/** An alert's colour and icon: fixed, critical, or a warning. */
export const alertLook = (
  alert: AlertRow,
): { tone: IconBubbleTone; Icon: LucideIcon } =>
  alert.resolvedAt !== null
    ? { tone: "emerald", Icon: CircleCheck }
    : alert.severity === "critical"
      ? { tone: "rose", Icon: OctagonAlert }
      : { tone: "amber", Icon: TriangleAlert };

const AlertCard = ({
  alert,
  focused,
  onAcknowledge,
}: {
  alert: AlertRow;
  focused: boolean;
  onAcknowledge: (alert: AlertRow) => Promise<void>;
}) => {
  const { what, todo, fixed } = alertWording(alert.key);
  const closed = alert.resolvedAt !== null;
  const { tone, Icon } = alertLook(alert);
  const [busy, setBusy] = useState(false);

  return (
    <Card
      id={`alert-${alert.id}`}
      className={clsx(focused && "ring-2 ring-ring")}
    >
      <CardContent className={clsx("flex gap-3")}>
        <IconBubble tone={tone}>
          <Icon />
        </IconBubble>
        <div className={clsx("flex min-w-0 flex-1 flex-col gap-1")}>
          <p className={clsx("leading-snug font-medium")}>
            {alert.boothName}: {what}
          </p>
          <p className={clsx("text-sm text-muted-foreground")}>
            {closed ? fixed : todo}
          </p>
          <p className={clsx("text-xs text-muted-foreground")}>
            {closed
              ? `Opened ${ago(alert.openedAt)}, fixed ${ago(alert.resolvedAt!)}.`
              : alert.ackedAt
                ? `Opened ${ago(alert.openedAt)}. Acknowledged ${ago(alert.ackedAt)}: no more reminders.`
                : `Opened ${ago(alert.openedAt)}.`}
          </p>
          {!closed && !alert.ackedAt ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={clsx("mt-1 self-start")}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onAcknowledge(alert).finally(() => setBusy(false));
              }}
            >
              <Hand data-icon="inline-start" />
              Acknowledge
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

/** What needs attention now, and what happened in the last day. */
export const AlertsScreen = ({
  live,
  focusId,
}: {
  live: Live<AlertRow[]>;
  focusId?: string;
}) => {
  const { open, closed } = sortAlerts(live.data ?? []);

  // A notification's link: bring its alert into view once it's there.
  useEffect(() => {
    if (focusId && live.data) {
      document
        .getElementById(`alert-${focusId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusId, live.data]);

  const onAcknowledge = async (alert: AlertRow) => {
    try {
      await acknowledge(alert.id);
      toast.success("Acknowledged: no more reminders for this one.");
      live.reload();
    } catch (error) {
      toast.error(messageOf(error, "Couldn't acknowledge it."));
    }
  };

  if (live.data === undefined) {
    return <LiveFallback error={live.error} what="alerts" />;
  }

  return (
    <div className={clsx("flex flex-col gap-6")}>
      <section className={clsx("flex flex-col gap-3")}>
        <h2 className={clsx("text-sm font-medium text-muted-foreground")}>
          Now
        </h2>
        {open.length === 0 ? (
          <Card>
            <CardContent className={clsx("flex items-center gap-3")}>
              <IconBubble tone="emerald">
                <CircleCheck />
              </IconBubble>
              <p className={clsx("text-sm")}>All booths are fine.</p>
            </CardContent>
          </Card>
        ) : (
          open.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              focused={alert.id === focusId}
              onAcknowledge={onAcknowledge}
            />
          ))
        )}
      </section>
      {closed.length > 0 ? (
        <section className={clsx("flex flex-col gap-3")}>
          <h2 className={clsx("text-sm font-medium text-muted-foreground")}>
            Last 24 hours
          </h2>
          {closed.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              focused={alert.id === focusId}
              onAcknowledge={onAcknowledge}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
};

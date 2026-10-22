import { alertWording } from "@dither-booth/protocol/alerts";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { CircleCheck, Hand, OctagonAlert, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  acknowledge,
  type AlertRow,
  listAlerts,
  sortAlerts,
} from "#lib/alerts";
import { useLive } from "#lib/live";

const ago = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

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
  const critical = alert.severity === "critical";
  const [busy, setBusy] = useState(false);

  return (
    <Card
      id={`alert-${alert.id}`}
      className={clsx(focused && "ring-2 ring-ring")}
    >
      <CardContent className={clsx("flex gap-3")}>
        <IconBubble tone={closed ? "emerald" : critical ? "rose" : "amber"}>
          {closed ? (
            <CircleCheck />
          ) : critical ? (
            <OctagonAlert />
          ) : (
            <TriangleAlert />
          )}
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
export const AlertsScreen = ({ focusId }: { focusId?: string }) => {
  const live = useLive("alerts", () => listAlerts(), ["alert"]);
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
      toast.error(
        error instanceof Error ? error.message : "Couldn't acknowledge it.",
      );
    }
  };

  if (live.data === undefined) {
    return live.error ? (
      <p className={clsx("text-sm text-destructive")}>
        Couldn't load the alerts. Check the connection.
      </p>
    ) : (
      <Spinner className="mx-auto size-5" />
    );
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

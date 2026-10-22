import { alertWording } from "@dither-booth/protocol/alerts";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";

import { alertLook } from "#app/AlertsScreen";
import { type AlertRow, waitingAlerts } from "#lib/alerts";

/**
 * On the other screens: the most urgent alert nobody acknowledged yet, live,
 * one tap from its card. A push can be muted (Focus); this can't.
 */
export const AlertBanner = ({
  alerts,
  onOpen,
}: {
  alerts: AlertRow[];
  onOpen: (alertId: string) => void;
}) => {
  const waiting = waitingAlerts(alerts);
  const first = waiting[0];

  return (
    <div aria-live="polite">
      {first ? (
        <BannerButton alert={first} more={waiting.length - 1} onOpen={onOpen} />
      ) : null}
    </div>
  );
};

const BannerButton = ({
  alert,
  more,
  onOpen,
}: {
  alert: AlertRow;
  more: number;
  onOpen: (alertId: string) => void;
}) => {
  const { tone, Icon } = alertLook(alert);
  return (
    <button
      type="button"
      onClick={() => onOpen(alert.id)}
      className={clsx(
        "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <IconBubble tone={tone}>
        <Icon />
      </IconBubble>
      <span className={clsx("flex min-w-0 flex-1 flex-col")}>
        <span className={clsx("leading-snug font-medium")}>
          {alert.boothName}: {alertWording(alert.key).what}
        </span>
        <span className={clsx("text-sm text-muted-foreground")}>
          {more > 0
            ? `And ${more} more. Tap to see the alerts.`
            : "Tap to see the alert."}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className={clsx("size-4 shrink-0 text-muted-foreground")}
      />
    </button>
  );
};

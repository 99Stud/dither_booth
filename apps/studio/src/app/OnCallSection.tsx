import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import clsx from "clsx";
import { TriangleAlert, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LiveFallback } from "#app/LiveFallback";
import { MemberStatusLine } from "#app/MemberStatusLine";
import { onCallBadge } from "#lib/events";
import { useLive } from "#lib/live";
import {
  onCallErrorMessage,
  type OnCallMember,
  onCallStatus,
  onCallSummary,
  type OnCallTone,
  readOnCall,
  setOnCall,
} from "#lib/on-call";

const SUMMARY_STYLE: Record<OnCallTone, string> = {
  ok: "text-muted-foreground",
  // IconBubble's amber text pair: the theme's --warning is a fill, too light
  // for text on the card.
  warn: "text-amber-700 dark:text-amber-300", // ds-allow-hardcode
  off: "text-muted-foreground",
};

/** Who gets an event's alerts, at a glance: "3 on call" or "Whole team". */
export const OnCallBadge = ({ onCall }: { onCall: number }) => (
  <Badge variant={onCall > 0 ? "secondary" : "outline"}>
    {onCallBadge(onCall)}
  </Badge>
);

const Row = ({
  member,
  canChange,
  onToggle,
}: {
  member: OnCallMember;
  canChange: boolean;
  onToggle: (onCall: boolean) => void;
}) => (
  <li className={clsx("flex items-center gap-3 py-3")}>
    <div className={clsx("flex min-w-0 flex-1 flex-col gap-1")}>
      <p className={clsx("flex items-center gap-1.5 text-sm font-medium")}>
        <span className={clsx("truncate")}>{member.email}</span>
        {member.you ? <Badge variant="outline">You</Badge> : null}
      </p>
      <MemberStatusLine status={onCallStatus(member)} />
    </div>
    <Switch
      aria-label={`On call: ${member.email}`}
      checked={member.onCall}
      disabled={!canChange}
      onCheckedChange={(checked) => onToggle(checked)}
    />
  </li>
);

const RowsSkeleton = () => (
  <Card aria-busy="true" aria-label="Loading who's on call">
    <CardContent className={clsx("flex flex-col gap-4")}>
      {[0, 1, 2].map((row) => (
        <div key={row} className={clsx("flex items-center justify-between")}>
          <div className={clsx("flex flex-col gap-1.5")}>
            <Skeleton className={clsx("h-4 w-44")} />
            <Skeleton className={clsx("h-3 w-20")} />
          </div>
          <Skeleton className={clsx("h-4.5 w-8 rounded-full")} />
        </div>
      ))}
    </CardContent>
  </Card>
);

/**
 * An event's On call: the booth's team, each with a switch. Those switched
 * on get the booth's alerts during the event; with nobody on call, or none
 * of them with a device, the whole team does. Each switch saves on its own;
 * only platform admins may flip them.
 */
export const OnCallSection = ({
  eventId,
  canChange,
  onOpenTeam,
}: {
  eventId: string;
  canChange: boolean;
  onOpenTeam: () => void;
}) => {
  const live = useLive(`on-call-${eventId}`, () => readOnCall(eventId), [
    "event_on_call",
  ]);
  // Switches flipped here, shown as asked until the Hub's answer is read.
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());

  const heading = <h3 className={clsx("text-base font-semibold")}>On call</h3>;

  if (live.data === undefined) {
    return (
      <section aria-label="On call" className={clsx("flex flex-col gap-3")}>
        {heading}
        {live.error ? (
          <LiveFallback error={live.error} what="list of who's on call" />
        ) : (
          <RowsSkeleton />
        )}
      </section>
    );
  }

  const { event } = live.data;
  const team = live.data.team.map((member) => ({
    ...member,
    onCall: pending.get(member.userId) ?? member.onCall,
  }));
  const summary = onCallSummary(team, event.boothName, event.name);

  const toggle = async (member: OnCallMember, onCall: boolean) => {
    setPending((now) => new Map(now).set(member.userId, onCall));
    try {
      await setOnCall(event.id, member.userId, onCall);
      // Hold the switch where it is until the saved list is in.
      await live.reload();
    } catch (error) {
      toast.error(onCallErrorMessage(error, member.email, onCall));
    } finally {
      setPending((now) => {
        const next = new Map(now);
        next.delete(member.userId);
        return next;
      });
    }
  };

  const others = team.filter((member) => !member.you);

  return (
    <section aria-label="On call" className={clsx("flex flex-col gap-3")}>
      <div className={clsx("flex items-start justify-between gap-3")}>
        <div className={clsx("flex flex-col gap-1")}>
          {heading}
          <p
            className={clsx(
              "flex items-start gap-1.5 text-sm",
              SUMMARY_STYLE[summary.tone],
            )}
          >
            {summary.tone === "warn" ? (
              <TriangleAlert
                aria-hidden
                className={clsx("mt-0.5 size-4 shrink-0")}
              />
            ) : null}
            {summary.text}
          </p>
        </div>
        <OnCallBadge onCall={summary.reaching} />
      </div>

      {team.length > 0 ? (
        <Card>
          <CardContent>
            <ul
              aria-label="Booth team"
              className={clsx("-my-3 divide-y divide-border")}
            >
              {team.map((member) => (
                <Row
                  key={member.userId}
                  member={member}
                  canChange={canChange}
                  onToggle={(onCall) => void toggle(member, onCall)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {others.length === 0 ? (
        <div className={clsx("flex flex-col items-start gap-2")}>
          <p className={clsx("text-sm text-muted-foreground")}>
            {team.length === 0
              ? `Nobody is in ${event.boothName}'s team yet.`
              : "You're the only one in this team."}{" "}
            Add people in Team first.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenTeam}
          >
            <Users data-icon="inline-start" />
            Open Team
          </Button>
        </div>
      ) : null}
      {canChange ? null : (
        <p className={clsx("text-sm text-muted-foreground")}>
          Only platform admins change who's on call.
        </p>
      )}
    </section>
  );
};

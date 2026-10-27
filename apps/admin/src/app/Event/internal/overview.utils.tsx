import { format, formatDistanceStrict, isSameDay } from "date-fns";

import type { VisitStats } from "./Event.types";

import {
  forecastPrizes,
  formatDuration,
  getDrawablePrizes,
  type OddsPrize,
} from "./lottery-odds.utils";

/** Visits in the last 15 minutes that make it busy: one every 3 minutes. */
export const BUSY_RECENT_VISITS = 5;

/** Minutes without a guest after which it is quiet. */
export const QUIET_AFTER_MINUTES = 30;

/** A prize the forecast sees running out within this many minutes needs a look. */
export const PRIZE_LOW_WITHIN_MINUTES = 60;

/** Minutes of guests shown after which the forecast trusts the measured pace. */
export const MEASURED_PACE_AFTER_MINUTES = 60;

const MINUTE_MS = 60_000;

/** `80` → `1 min 20 s`: a visit lasts about a minute, so words, not `1:20`. */
export const formatTimeAtBooth = (seconds: number): string => {
  if (seconds < 60) return `${seconds} s`;
  if (seconds >= 3600) return formatDuration(Math.floor(seconds / 60));
  const rest = seconds % 60;
  const minutes = `${Math.floor(seconds / 60)} min`;
  return rest === 0 ? minutes : `${minutes} ${rest} s`;
};

/** An hour's start as the booth's clock reads it: `22:00`. */
export const formatHour = (iso: string): string =>
  format(new Date(iso), "HH:mm");

/** `22:00 to 23:00`, for the hour starting at `iso`. */
export const formatHourRange = (iso: string): string => {
  const start = new Date(iso);
  return `${format(start, "HH:mm")} to ${format(start.getTime() + 3_600_000, "HH:mm")}`;
};

/** `at 21:42` today, `on Fri 30 Oct at 21:42` another day. */
export const formatWhen = (iso: string, now: Date): string => {
  const at = new Date(iso);
  return isSameDay(at, now)
    ? `at ${format(at, "HH:mm")}`
    : `on ${format(at, "EEE d MMM 'at' HH:mm")}`;
};

const guests = (count: number) =>
  `${count} ${count === 1 ? "guest" : "guests"}`;

export type OverviewMood =
  | "upcoming"
  | "not-started"
  | "busy"
  | "steady"
  | "quiet"
  | "ended";

/** What the Overview needs from the event: its times, lottery and prizes. */
export type OverviewEvent = {
  campaign: { startsAt: string | null; endsAt: string | null };
  lottery: {
    enabled: boolean;
    noWinWeight: number;
    winCooldownMinutes: number;
  };
  prizes: OddsPrize[];
};

/** One thing staff should act on, in words, and where they act on it. */
export type AttentionItem =
  | { kind: "failed-print" | "booth"; text: string; target: "control-center" }
  | { kind: "times"; text: string; target: "details" }
  | { kind: "prize-low"; text: string; target: "restock"; prizeId: string };

export type OverviewSummary = {
  mood: OverviewMood;
  /** One sentence on how it's going, for anyone. */
  headline: string;
  /**
   * The event's outcome: what a client may see (C1). Never failures,
   * booth health or anything staff act on.
   */
  shareable: {
    guests: number;
    captured: number;
    prints: number;
    walkedAway: number;
    /** Prints over guests, from 0 to 1; null before the first guest. */
    printShare: number | null;
    /** Null while the lottery never drew. */
    prizesWon: number | null;
    /** "1 in N guests won", among guests who drew; null before a win. */
    guestsPerWin: number | null;
    timeAtBoothS: number | null;
    busiestHour: VisitStats["busiestHour"];
  };
  /**
   * Staff only, most urgent first: failed prints, the booth, the prizes,
   * then the event's missing times.
   */
  attention: AttentionItem[];
  lottery: {
    /** The pace behind the forecast: measured after the first hour. */
    guestsPerHour: number;
    isPaceMeasured: boolean;
    /** When all prizes are expected to run out, or null past the horizon. */
    runsOutAfterMinutes: number | null;
    /** When the pause after the last win ends, ISO; null when no pause runs. */
    nextWinAt: string | null;
  };
};

/**
 * The Overview in words and facts, from the visit stats, the event and the
 * booth's health (`boothProblems`, null while unknown). Pure, so the rules
 * are tested once and can move to Studio with the shareable part.
 */
export const summarizeOverview = ({
  stats,
  event,
  boothProblems,
  estimatedGuestsPerHour,
  now,
}: {
  stats: VisitStats;
  event: OverviewEvent;
  boothProblems: string[] | null;
  estimatedGuestsPerHour: number;
  now: Date;
}): OverviewSummary => {
  const nowMs = now.getTime();
  const draws = stats.wins + stats.losses;
  const { startsAt, endsAt } = event.campaign;

  // The pace over the hours shown (at most a day), not since the first
  // guest: an event that ran for weeks would average to nothing. It stops
  // at the event's end.
  const paceEndMs = endsAt
    ? Math.min(nowMs, new Date(endsAt).getTime())
    : nowMs;
  const windowStartMs = Math.max(
    stats.firstVisitAt ? new Date(stats.firstVisitAt).getTime() : nowMs,
    stats.hourly[0] ? new Date(stats.hourly[0].hour).getTime() : nowMs,
  );
  const minutesShown = (paceEndMs - windowStartMs) / MINUTE_MS;
  const visitsShown = stats.hourly.reduce((sum, hour) => sum + hour.visits, 0);
  const isPaceMeasured = minutesShown >= MEASURED_PACE_AFTER_MINUTES;
  const guestsPerHour = isPaceMeasured
    ? Math.round(visitsShown / (minutesShown / 60))
    : estimatedGuestsPerHour;

  const { lottery } = event;
  const forecast = forecastPrizes({
    prizes: event.prizes,
    noWinWeight: lottery.noWinWeight,
    cooldownMinutes: lottery.winCooldownMinutes,
    guestsPerHour,
  });
  const pauseEndsMs = stats.lastWinAt
    ? new Date(stats.lastWinAt).getTime() +
      lottery.winCooldownMinutes * MINUTE_MS
    : null;

  return {
    ...describeMood(stats, event.campaign, now),
    shareable: {
      guests: stats.visits,
      captured: stats.captured,
      prints: stats.prints,
      walkedAway: stats.abandoned,
      printShare: stats.visits > 0 ? stats.prints / stats.visits : null,
      prizesWon: draws > 0 ? stats.wins : null,
      guestsPerWin: stats.wins > 0 ? Math.round(draws / stats.wins) : null,
      timeAtBoothS: stats.avgDurationS,
      busiestHour: stats.busiestHour,
    },
    attention: [
      ...failedPrintItems(stats, now),
      ...(boothProblems ?? []).map(
        (text): AttentionItem => ({
          kind: "booth",
          text,
          target: "control-center",
        }),
      ),
      ...(lottery.enabled
        ? lowPrizeItems(event.prizes, forecast.prizeRunsOutAfterMinutes)
        : []),
      ...(startsAt === null && endsAt === null
        ? [
            {
              kind: "times",
              text: "Set when the event starts and ends, so setup tests don't count.",
              target: "details",
            } satisfies AttentionItem,
          ]
        : []),
    ],
    lottery: {
      guestsPerHour,
      isPaceMeasured,
      runsOutAfterMinutes: forecast.runsOutAfterMinutes,
      nextWinAt:
        lottery.enabled && pauseEndsMs !== null && pauseEndsMs > nowMs
          ? new Date(pauseEndsMs).toISOString()
          : null,
    },
  };
};

const describeMood = (
  stats: VisitStats,
  times: OverviewEvent["campaign"],
  now: Date,
): Pick<OverviewSummary, "mood" | "headline"> => {
  if (times.startsAt && new Date(times.startsAt) > now) {
    return {
      mood: "upcoming",
      headline: `Starts ${formatWhen(times.startsAt, now)}. Visits before then are tests and don't count.`,
    };
  }
  if (times.endsAt && new Date(times.endsAt) <= now) {
    const ended = `This event ended ${formatWhen(times.endsAt, now)}`;
    return {
      mood: "ended",
      headline:
        stats.visits === 0
          ? `${ended}, with no guests.`
          : `${ended}. ${guests(stats.visits)} came.`,
    };
  }
  if (stats.visits === 0 || !stats.lastVisitAt) {
    return {
      mood: "not-started",
      headline:
        "No guests yet. They show up here from their first tap on Start.",
    };
  }

  const soFar = `${guests(stats.visits)} so far`;
  const recent = `${stats.recentVisits} in the last 15 minutes`;
  const lastOne = `the last one ${formatDistanceStrict(
    new Date(stats.lastVisitAt),
    now,
    { addSuffix: true },
  )}`;
  const minutesSinceLast =
    (now.getTime() - new Date(stats.lastVisitAt).getTime()) / MINUTE_MS;

  if (stats.recentVisits >= BUSY_RECENT_VISITS) {
    return { mood: "busy", headline: `Busy right now. ${soFar}, ${recent}.` };
  }
  if (minutesSinceLast >= QUIET_AFTER_MINUTES) {
    return { mood: "quiet", headline: `Quiet for now. ${soFar}, ${lastOne}.` };
  }
  return {
    mood: "steady",
    headline: `Going well. ${soFar}, ${stats.recentVisits > 0 ? recent : lastOne}.`,
  };
};

const failedPrintItems = (stats: VisitStats, now: Date): AttentionItem[] => {
  const items = stats.failedVisits.map(
    (visit): AttentionItem => ({
      kind: "failed-print",
      text: `${visit.ticketRef ? `Ticket ${visit.ticketRef}` : "A ticket"} didn't print ${formatWhen(visit.startedAt, now)}.`,
      target: "control-center",
    }),
  );
  const more = stats.failed - stats.failedVisits.length;
  if (more > 0) {
    items.push({
      kind: "failed-print",
      text: `${more} more ${more === 1 ? "ticket" : "tickets"} didn't print.`,
      target: "control-center",
    });
  }
  return items;
};

const lowPrizeItems = (
  prizes: OddsPrize[],
  runsOutAfterMinutes: Record<string, number>,
): AttentionItem[] => {
  const drawable = new Set(getDrawablePrizes(prizes).map((prize) => prize.id));

  return prizes.flatMap((prize): AttentionItem[] => {
    const item = (text: string): AttentionItem[] => [
      { kind: "prize-low", text, target: "restock", prizeId: prize.id },
    ];
    if (prize.remainingQuantity === 0) {
      return item(`“${prize.title}” has run out.`);
    }
    if (!drawable.has(prize.id)) return [];
    if (prize.remainingQuantity === 1) {
      return item(`Only 1 “${prize.title}” left.`);
    }
    const minutes = runsOutAfterMinutes[prize.id];
    return minutes !== undefined && minutes <= PRIZE_LOW_WITHIN_MINUTES
      ? item(
          `“${prize.title}” could run out within ${formatDuration(minutes)}.`,
        )
      : [];
  });
};

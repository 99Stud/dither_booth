import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import type { DbExecutor } from "#db/internal/db.types";

import { campaignTable, drawTable, visitTable } from "#db/internal/db.schema";

/**
 * The most hours `hourly` covers, the current one included: a long night,
 * readable on a phone. A longer event keeps its totals and busiest hour.
 */
export const VISIT_STATS_HOURS = 24;

/** How far back `recentVisits` looks: the pace staff feel in the room. */
export const VISIT_STATS_RECENT_MINUTES = 15;

/** How many failed visits `failedVisits` lists; `failed` counts them all. */
export const VISIT_STATS_FAILED_LIMIT = 5;

const HOUR_S = 3600;

type HourCount = { hour: string; visits: number };

/**
 * The active event's visits, for admin's Overview. Only visits that started
 * between the event's start and end count (`campaign.starts_at`/`ends_at`,
 * either side open when null); the rest are setup tests or packing up, and
 * only `uncounted` counts them. The names follow the Hub's planned
 * `event_summary`, so Studio can show the same facts.
 */
export type VisitStats = {
  /** Every counted visit, however it ended or if it hasn't yet. */
  visits: number;
  /** The event's visits outside its start and end: recorded, not counted. */
  uncounted: number;
  /** Visits that took their photo. */
  captured: number;
  /** Visits that got their receipt: completed. */
  prints: number;
  /** Visits whose printing failed. */
  failed: number;
  /** Visits the guest or the page left before the end. */
  abandoned: number;
  /** Visits whose draw won a prize. */
  wins: number;
  /** Visits whose draw ran and lost. */
  losses: number;
  /** Mean length of a completed visit, Start to the end; null until one has one. */
  avgDurationS: number | null;
  /** When the first and the last visit started, as ISO; null before the first. */
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  /** Visits started in the last `VISIT_STATS_RECENT_MINUTES`. */
  recentVisits: number;
  /**
   * Visits started each hour, from the event's start (or its first visit's
   * hour when it has none) to the current hour, or to its end once it
   * ended; at most the last `VISIT_STATS_HOURS`, oldest first, empty hours
   * included. Empty before then. `hour` is the hour's start, ISO.
   */
  hourly: HourCount[];
  /** The hour with the most visits over the whole event, the latest on a tie. */
  busiestHour: HourCount | null;
  /** The latest failed visits, newest first, with their ticket number if any. */
  failedVisits: Array<{ startedAt: string; ticketRef: string | null }>;
  /**
   * When the event's last winning draw ran, as ISO; null before one. Not
   * limited to the start and end: a test win still starts the pause.
   */
  lastWinAt: string | null;
};

const count = (condition: ReturnType<typeof sql>) =>
  sql<number>`coalesce(sum(case when ${condition} then 1 else 0 end), 0)`.mapWith(
    Number,
  );

const toIso = (seconds: number | null) =>
  seconds === null ? null : new Date(seconds * 1000).toISOString();

/** The active event's visit counts, or null when no event is active. */
export function getVisitStatsForDb(
  executor: DbExecutor,
  now: Date = new Date(),
): VisitStats | null {
  const campaign = executor
    .select({
      id: campaignTable.id,
      startsAt: campaignTable.startsAt,
      endsAt: campaignTable.endsAt,
    })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (!campaign) return null;

  const ofEvent = eq(visitTable.campaignId, campaign.id);
  // The visits that count: the event's, between its start and end.
  const counted = and(
    ofEvent,
    campaign.startsAt
      ? gte(visitTable.startedAt, campaign.startsAt)
      : undefined,
    campaign.endsAt ? lt(visitTable.startedAt, campaign.endsAt) : undefined,
  );
  const nowS = Math.floor(now.getTime() / 1000);
  const durationS = sql`${visitTable.endedAt} - ${visitTable.startedAt}`;
  const totals = executor
    .select({
      visits: sql<number>`count(*)`.mapWith(Number),
      captured: count(sql`${visitTable.capturedAt} is not null`),
      prints: count(sql`${visitTable.endReason} = 'completed'`),
      failed: count(sql`${visitTable.endReason} = 'failed'`),
      abandoned: count(sql`${visitTable.endReason} = 'abandoned'`),
      wins: count(sql`${drawTable.prizeId} is not null`),
      losses: count(
        sql`${drawTable.lotteryId} is not null and ${drawTable.prizeId} is null`,
      ),
      // A backfilled visit knows only its draw's time, so it has no length.
      avgDurationS: sql<number | null>`avg(case
        when ${visitTable.endReason} = 'completed' and ${durationS} > 0
        then ${durationS} end)`,
      firstStartedAt: sql<number | null>`min(${visitTable.startedAt})`,
      lastStartedAt: sql<number | null>`max(${visitTable.startedAt})`,
      recentVisits: count(
        sql`${visitTable.startedAt} >= ${nowS - VISIT_STATS_RECENT_MINUTES * 60}`,
      ),
    })
    .from(visitTable)
    .leftJoin(drawTable, eq(drawTable.id, visitTable.drawId))
    .where(counted)
    .get() ?? {
    visits: 0,
    captured: 0,
    prints: 0,
    failed: 0,
    abandoned: 0,
    wins: 0,
    losses: 0,
    avgDurationS: null,
    firstStartedAt: null,
    lastStartedAt: null,
    recentVisits: 0,
  };
  const { avgDurationS, firstStartedAt, lastStartedAt, ...counts } = totals;
  const eventVisits =
    executor
      .select({ visits: sql<number>`count(*)`.mapWith(Number) })
      .from(visitTable)
      .where(ofEvent)
      .get()?.visits ?? 0;

  // Hours are counted in epoch seconds, so they start on the hour wherever
  // the booth's time zone is a whole number of hours from UTC.
  const hourS = sql<number>`${visitTable.startedAt} - ${visitTable.startedAt} % ${HOUR_S}`;
  const perHour = executor
    .select({
      hourS: hourS.mapWith(Number),
      visits: sql<number>`count(*)`.mapWith(Number),
    })
    .from(visitTable)
    .where(counted)
    .groupBy(hourS)
    .all();
  const visitsByHour = new Map(perHour.map((row) => [row.hourS, row.visits]));
  const toHourCount = (startS: number): HourCount => ({
    hour: new Date(startS * 1000).toISOString(),
    visits: visitsByHour.get(startS) ?? 0,
  });

  const toHourS = (seconds: number) => Math.floor(seconds / HOUR_S) * HOUR_S;
  const startsS = campaign.startsAt ? campaign.startsAt.getTime() / 1000 : null;
  const endsS = campaign.endsAt ? campaign.endsAt.getTime() / 1000 : null;
  const fromS = startsS ?? firstStartedAt;
  // The hour the event ended in (`ends_at` is exclusive), or the current one.
  const lastHourS = toHourS(endsS !== null && endsS <= nowS ? endsS - 1 : nowS);
  const firstHourS =
    fromS === null
      ? null
      : Math.max(toHourS(fromS), lastHourS - (VISIT_STATS_HOURS - 1) * HOUR_S);
  const hourly =
    firstHourS === null || firstHourS > lastHourS
      ? []
      : Array.from(
          { length: (lastHourS - firstHourS) / HOUR_S + 1 },
          (_, index) => toHourCount(firstHourS + index * HOUR_S),
        );

  const busiest = perHour.reduce<(typeof perHour)[number] | null>(
    (best, row) =>
      !best ||
      row.visits > best.visits ||
      (row.visits === best.visits && row.hourS > best.hourS)
        ? row
        : best,
    null,
  );

  const failedVisits = executor
    .select({
      startedAt: visitTable.startedAt,
      ticketRef: drawTable.ticketRef,
    })
    .from(visitTable)
    .leftJoin(drawTable, eq(drawTable.id, visitTable.drawId))
    .where(and(counted, eq(visitTable.endReason, "failed")))
    .orderBy(desc(visitTable.startedAt))
    .limit(VISIT_STATS_FAILED_LIMIT)
    .all()
    .map((row) => ({
      startedAt: row.startedAt.toISOString(),
      ticketRef: row.ticketRef,
    }));

  const lastWin = executor
    .select({ at: sql<number | null>`max(${drawTable.createdAt})` })
    .from(drawTable)
    .where(
      and(eq(drawTable.campaignId, campaign.id), isNotNull(drawTable.prizeId)),
    )
    .get();

  return {
    ...counts,
    uncounted: eventVisits - counts.visits,
    avgDurationS: avgDurationS === null ? null : Math.round(avgDurationS),
    firstVisitAt: toIso(firstStartedAt),
    lastVisitAt: toIso(lastStartedAt),
    hourly,
    busiestHour: busiest ? toHourCount(busiest.hourS) : null,
    failedVisits,
    lastWinAt: toIso(lastWin?.at ?? null),
  };
}

import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { lotteryEventTable } from "#domains/lottery/internal/lottery.schema.ts";
import { LOTTERY_OUTCOME } from "#domains/lottery/internal/lottery.constants.ts";

export const getLotteryAnalytics = publicProcedure.query(async () => {
  const events = await db.select().from(lotteryEventTable).all();

  const totalAttempts = events.length;
  const wins = events.filter((e) => e.outcome === LOTTERY_OUTCOME.WIN).length;
  const losses = events.filter(
    (e) => e.outcome === LOTTERY_OUTCOME.LOSS,
  ).length;
  const forcedLosses = events.filter(
    (e) => e.outcome === LOTTERY_OUTCOME.FORCED_LOSS,
  ).length;
  const abuseDetectedCount = events.filter((e) => e.abuseDetected).length;

  const hourlyBreakdown = new Map<
    string,
    { attempts: number; wins: number; losses: number; forcedLosses: number }
  >();

  for (const event of events) {
    const hour = event.timestamp.slice(11, 13) || "??";
    const bucket = hourlyBreakdown.get(hour) ?? {
      attempts: 0,
      wins: 0,
      losses: 0,
      forcedLosses: 0,
    };
    bucket.attempts++;
    if (event.outcome === LOTTERY_OUTCOME.WIN) bucket.wins++;
    else if (event.outcome === LOTTERY_OUTCOME.LOSS) bucket.losses++;
    else if (event.outcome === LOTTERY_OUTCOME.FORCED_LOSS)
      bucket.forcedLosses++;
    hourlyBreakdown.set(hour, bucket);
  }

  const hourly = Array.from(hourlyBreakdown.entries())
    .map(([hour, stats]) => ({ hour, ...stats }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  return {
    totalAttempts,
    wins,
    losses,
    forcedLosses,
    abuseDetectedCount,
    winRate: totalAttempts > 0 ? wins / totalAttempts : 0,
    forcedLossRate: totalAttempts > 0 ? forcedLosses / totalAttempts : 0,
    hourly,
  };
});

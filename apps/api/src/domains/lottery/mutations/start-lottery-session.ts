import { db } from "#db/index.ts";
import { publicProcedure } from "#internal/trpc.ts";
import {
  LOTTERY_CONFIG_SINGLETON_ID,
  START_LOTTERY_SESSION_SCHEMA,
} from "#domains/lottery/internal/lottery.constants.ts";
import {
  lotteryConfigTable,
  lotterySessionTable,
} from "#domains/lottery/internal/lottery.schema.ts";
import { eq } from "drizzle-orm";

export const startLotterySession = publicProcedure
  .input(START_LOTTERY_SESSION_SCHEMA.optional())
  .mutation(async ({ input }) => {
    const now = new Date().toISOString();
    const title = input?.title?.trim() || null;
    const existing = await db.query.lotteryConfigTable.findFirst();

    if (existing?.sessionActive && existing.currentSessionId != null) {
      return existing;
    }

    const [session] = await db
      .insert(lotterySessionTable)
      .values({
        title: title ?? undefined,
        startedAt: now,
        endedAt: null,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to create lottery session.");
    }

    if (!existing) {
      const [row] = await db
        .insert(lotteryConfigTable)
        .values({
          enabled: true,
          currentSessionId: session.id,
          sessionActive: true,
          sessionStartedAt: now,
        })
        .returning();
      return row!;
    }

    const [row] = await db
      .update(lotteryConfigTable)
      .set({
        enabled: true,
        currentSessionId: session.id,
        sessionActive: true,
        sessionStartedAt: now,
      })
      .where(eq(lotteryConfigTable.id, LOTTERY_CONFIG_SINGLETON_ID))
      .returning();

    return row!;
  });

import { getKioskErrorDiagnostics } from "@dither-booth/logging";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DB, DbExecutor, DbTransaction } from "#db/internal/db.types";
import type { RecordedDraw } from "#domains/lottery/lottery.service";

import {
  campaignTable,
  drawTable,
  VISIT_END_REASONS,
  visitTable,
} from "#db/internal/db.schema";

export type VisitEndReason = (typeof VISIT_END_REASONS)[number];

type Log = (
  level: "info" | "warn" | "error",
  event: string,
  details?: Record<string, unknown>,
) => void;

/**
 * Records each guest's visit for the event's counts and, later, the Hub.
 * There is one kiosk, so at most one visit is open: starting a visit closes
 * the one before. Every visit ends, here or at the next start or boot.
 * Recording never gets in a guest's way: every method logs its failures and
 * returns instead of throwing.
 */
export type Visits = {
  /** Start pressed. `visitId` is null when it couldn't be recorded. */
  start: () => { visitId: string | null };
  /**
   * The photo was taken and the draw ran. Called inside the draw's
   * transaction, so a draw always has its visit. Without a visit to link
   * (`visitId` null or unknown, or that visit already drew) it starts one.
   * Returns the visit's id, or null when it couldn't be recorded.
   */
  captured: (
    tx: DbTransaction,
    visitId: string | null,
    draw: RecordedDraw,
  ) => string | null;
  /** One print of the visit's tickets ended, printed in full or not. */
  printed: (ticketRef: string, ok: boolean) => void;
  /** The kiosk says how the visit ended. Only the first end counts. */
  end: (visitId: string, reason: VisitEndReason) => void;
  /** Engine boot: no visit survives a restart. */
  closeStale: () => void;
};

/**
 * Ends every open visit: completed if its receipt printed (the kiosk never
 * said so), otherwise abandoned. It ends at its last known step, not when it
 * was noticed.
 */
const closeOpenVisits = (executor: DbExecutor, at: Date) =>
  executor
    .update(visitTable)
    .set({
      endedAt: sql`coalesce(${visitTable.printedAt}, ${visitTable.capturedAt}, ${visitTable.startedAt})`,
      endReason: sql`case when ${visitTable.printedAt} is not null then 'completed' else 'abandoned' end`,
      updatedAt: at,
    })
    .where(isNull(visitTable.endedAt))
    .returning({ id: visitTable.id })
    .all().length;

const activeCampaignId = (executor: DbExecutor) =>
  executor
    .select({ id: campaignTable.id })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get()?.id ?? null;

export function createVisits({
  db,
  log,
  now = () => new Date(),
}: {
  db: DB;
  log: Log;
  now?: () => Date;
}): Visits {
  const logFailure = (
    event: string,
    error: unknown,
    details: Record<string, unknown>,
  ) => {
    log("error", event, {
      ...details,
      error: getKioskErrorDiagnostics(error, "Visit not recorded."),
    });
  };

  return {
    start() {
      try {
        const at = now();
        const visitId = createId();

        db.transaction((tx) => {
          closeOpenVisits(tx, at);
          tx.insert(visitTable)
            .values({
              id: visitId,
              campaignId: activeCampaignId(tx),
              startedAt: at,
              updatedAt: at,
            })
            .run();
        });

        return { visitId };
      } catch (error) {
        logFailure("visit-start-failed", error, {});
        return { visitId: null };
      }
    },

    captured(tx, visitId, draw) {
      try {
        // A savepoint: a failure here rolls back the visit, never the draw.
        return tx.transaction((savepoint) => {
          const at = now();

          // An ended visit still takes its draw: the kiosk may have given up
          // on the print first. Starting another would count the guest twice.
          if (visitId !== null) {
            const linked = savepoint
              .update(visitTable)
              .set({
                campaignId: draw.campaignId,
                capturedAt: at,
                drawId: draw.id,
                updatedAt: at,
              })
              .where(and(eq(visitTable.id, visitId), isNull(visitTable.drawId)))
              .returning({ id: visitTable.id })
              .get();

            if (linked) return visitId;
          }

          const startedVisitId = createId();
          closeOpenVisits(savepoint, at);
          savepoint
            .insert(visitTable)
            .values({
              id: startedVisitId,
              campaignId: draw.campaignId,
              startedAt: at,
              capturedAt: at,
              drawId: draw.id,
              updatedAt: at,
            })
            .run();

          return startedVisitId;
        });
      } catch (error) {
        logFailure("visit-capture-failed", error, {
          drawId: draw.id,
          visitId,
        });
        return null;
      }
    },

    printed(ticketRef, ok) {
      try {
        const at = now();

        db.update(visitTable)
          .set({
            printAttempts: sql`${visitTable.printAttempts} + 1`,
            ...(ok ? { printedAt: at } : {}),
            updatedAt: at,
          })
          .where(
            inArray(
              visitTable.drawId,
              db
                .select({ id: drawTable.id })
                .from(drawTable)
                .where(eq(drawTable.ticketRef, ticketRef)),
            ),
          )
          .run();
      } catch (error) {
        logFailure("visit-print-failed", error, { ok, ticketRef });
      }
    },

    end(visitId, reason) {
      try {
        const at = now();

        db.update(visitTable)
          .set({ endedAt: at, endReason: reason, updatedAt: at })
          .where(and(eq(visitTable.id, visitId), isNull(visitTable.endedAt)))
          .run();
      } catch (error) {
        logFailure("visit-end-failed", error, { reason, visitId });
      }
    },

    closeStale() {
      try {
        const closed = closeOpenVisits(db, now());
        if (closed > 0) log("info", "visits-closed-at-boot", { closed });
      } catch (error) {
        logFailure("visits-close-failed", error, {});
      }
    },
  };
}

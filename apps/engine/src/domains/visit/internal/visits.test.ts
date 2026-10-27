import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import type { DB } from "#db/internal/db.types";

import {
  campaignTable,
  drawTable,
  lotteryTable,
  prizeTable,
  stockAdjustmentTable,
  visitTable,
} from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import {
  getVisitStatsForDb,
  VISIT_STATS_FAILED_LIMIT,
  VISIT_STATS_HOURS,
} from "./visit.stats";
import { createVisits } from "./visits";

const openDbs: Array<{ close: () => void }> = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
});

/** Visits on a test database, with a clock the test moves in seconds. */
function setup({ campaign = true }: { campaign?: boolean } = {}) {
  const { db, sqlite } = createTestDb();
  openDbs.push(sqlite);

  if (campaign) {
    db.insert(campaignTable).values({ id: "c1", name: "Halloween" }).run();
  }

  let seconds = 1_000;
  const logged: string[] = [];
  const visits = createVisits({
    db,
    log: (_level, event) => logged.push(event),
    now: () => new Date(seconds * 1000),
  });

  return {
    db,
    logged,
    visits,
    tick: (by: number) => {
      seconds += by;
    },
  };
}

/** A draw row and the visit linked to it, the way the lottery records one. */
function draw(
  db: DB,
  visits: ReturnType<typeof createVisits>,
  visitId: string | null,
  ticketRef: string,
) {
  return db.transaction((tx) => {
    tx.insert(drawTable)
      .values({ id: `draw-${ticketRef}`, campaignId: "c1", ticketRef })
      .run();
    return visits.captured(tx, visitId, {
      id: `draw-${ticketRef}`,
      campaignId: "c1",
    });
  });
}

const rows = (db: DB) =>
  db.select().from(visitTable).orderBy(visitTable.startedAt).all();

describe("visits", () => {
  test("a visit runs from Start to its end", () => {
    const { db, tick, visits } = setup();

    const { visitId } = visits.start();
    tick(20);
    draw(db, visits, visitId, "000001");
    tick(30);
    visits.printed("000001", true);
    tick(5);
    visits.end(visitId!, "completed");

    expect(rows(db)).toEqual([
      expect.objectContaining({
        id: visitId,
        campaignId: "c1",
        startedAt: new Date(1_000_000),
        capturedAt: new Date(1_020_000),
        drawId: "draw-000001",
        printedAt: new Date(1_050_000),
        printAttempts: 1,
        endedAt: new Date(1_055_000),
        endReason: "completed",
        updatedAt: new Date(1_055_000),
        reportedAt: null,
      }),
    ]);
  });

  test("starting a visit closes the one left open", () => {
    const { db, tick, visits } = setup();

    const first = visits.start();
    tick(10);
    draw(db, visits, first.visitId, "000001");
    tick(60);
    const second = visits.start();

    expect(rows(db)).toMatchObject([
      // Ends where it was last seen, not when the next guest came.
      {
        id: first.visitId,
        endReason: "abandoned",
        endedAt: new Date(1_010_000),
      },
      { id: second.visitId, endedAt: null },
    ]);
  });

  test("a visit left open after its receipt printed counts as completed", () => {
    const { db, tick, visits } = setup();

    const { visitId } = visits.start();
    draw(db, visits, visitId, "000001");
    tick(30);
    visits.printed("000001", true);
    tick(60);
    visits.start();

    expect(rows(db)[0]).toMatchObject({
      endReason: "completed",
      endedAt: new Date(1_030_000),
    });
  });

  test("a draw without a visit id joins the visit Start just opened", () => {
    const { db, tick, visits } = setup();

    // The kiosk sent the photo before startVisit's answer reached it.
    const { visitId } = visits.start();
    tick(10);
    const linked = draw(db, visits, null, "000001");

    expect(linked).toBe(visitId);
    expect(rows(db)).toMatchObject([
      { id: visitId, drawId: "draw-000001", endedAt: null },
    ]);
  });

  test("a draw without a visit starts one when the open one is stale", () => {
    const { db, tick, visits } = setup();

    // A guest the page lost before their photo, long ago.
    const { visitId: stale } = visits.start();
    tick(10 * 60);
    const linked = draw(db, visits, null, "000001");

    expect(linked).not.toBe(stale);
    expect(rows(db)).toMatchObject([
      { id: stale, endReason: "abandoned", drawId: null },
      { id: linked, drawId: "draw-000001", endedAt: null },
    ]);
  });

  test("printed tickets make a visit completed, whatever the kiosk said", () => {
    const { db, tick, visits } = setup();

    // The kiosk gave up first, then the print came out.
    const late = visits.start().visitId!;
    draw(db, visits, late, "000001");
    visits.end(late, "failed");
    visits.printed("000001", true);
    // The print came out first, then the kiosk's timeout said failed.
    tick(60);
    const slow = visits.start().visitId!;
    draw(db, visits, slow, "000002");
    visits.printed("000002", true);
    visits.end(slow, "failed");

    expect(rows(db)).toMatchObject([
      { id: late, endReason: "completed" },
      { id: slow, endReason: "completed" },
    ]);
  });

  test("a restart mid-visit, then the print: completed", () => {
    const { db, visits } = setup();

    const { visitId } = visits.start();
    visits.closeStale();
    draw(db, visits, visitId, "000001");
    visits.printed("000001", true);

    expect(rows(db)).toMatchObject([{ id: visitId, endReason: "completed" }]);
  });

  test("a failed print leaves a failed visit failed", () => {
    const { db, visits } = setup();

    const { visitId } = visits.start();
    draw(db, visits, visitId, "000001");
    visits.printed("000001", false);
    visits.end(visitId!, "failed");

    expect(rows(db)).toMatchObject([{ endReason: "failed", printedAt: null }]);
  });

  test("a second draw for the same visit gets a visit of its own", () => {
    const { db, visits } = setup();

    const { visitId } = visits.start();
    draw(db, visits, visitId, "000001");
    const second = draw(db, visits, visitId, "000002");

    expect(second).not.toBe(visitId);
    expect(rows(db).map((row) => row.drawId)).toEqual([
      "draw-000001",
      "draw-000002",
    ]);
  });

  test("a draw that comes after its visit ended still joins it", () => {
    const { db, visits } = setup();

    // The kiosk gave up on the print before the draw answered: the guest
    // still counts once, with the draw on their visit.
    const { visitId } = visits.start();
    visits.end(visitId!, "failed");
    const linked = draw(db, visits, visitId, "000001");

    expect(linked).toBe(visitId);
    expect(rows(db)).toMatchObject([
      { id: visitId, drawId: "draw-000001", endReason: "failed" },
    ]);
  });

  test("a failed link keeps the draw and logs", () => {
    const { db, logged, visits } = setup();

    const linked = db.transaction((tx) => {
      tx.insert(drawTable)
        .values({ id: "d1", campaignId: "c1", ticketRef: "000001" })
        .run();
      // No such draw: the visit's foreign key refuses it.
      return visits.captured(tx, null, { id: "missing", campaignId: "c1" });
    });

    expect(linked).toBeNull();
    expect(logged).toEqual(["visit-capture-failed"]);
    expect(db.select().from(drawTable).all()).toHaveLength(1);
    expect(rows(db)).toEqual([]);
  });

  test("only the first end counts", () => {
    const { db, tick, visits } = setup();

    const { visitId } = visits.start();
    tick(10);
    visits.end(visitId!, "failed");
    tick(10);
    visits.end(visitId!, "completed");

    expect(rows(db)).toMatchObject([
      { endReason: "failed", endedAt: new Date(1_010_000) },
    ]);
  });

  test("a failed print counts an attempt without printing", () => {
    const { db, visits } = setup();

    const { visitId } = visits.start();
    draw(db, visits, visitId, "000001");
    visits.printed("000001", false);

    expect(rows(db)).toMatchObject([{ printAttempts: 1, printedAt: null }]);
  });

  test("boot closes every visit still open", () => {
    const { db, logged, visits } = setup();

    visits.start();
    visits.closeStale();

    expect(rows(db)).toMatchObject([{ endReason: "abandoned" }]);
    expect(logged).toEqual(["visits-closed-at-boot"]);
  });

  test("a visit with no event records none", () => {
    const { db, visits } = setup({ campaign: false });

    visits.start();

    expect(rows(db)).toMatchObject([{ campaignId: null }]);
  });
});

const HOUR = 3_600;

/** A visit row as the booth leaves it, at `startedS` seconds, for the stats. */
function seedVisit(
  db: DB,
  id: string,
  startedS: number,
  {
    campaignId = "c1",
    endReason = "completed",
    captured = true,
    lengthS = 60,
    draw,
  }: {
    campaignId?: string;
    endReason?: "completed" | "failed" | "abandoned" | null;
    captured?: boolean;
    lengthS?: number;
    draw?: { ticketRef: string; lottery?: boolean; prize?: boolean };
  } = {},
) {
  if (draw) {
    db.insert(drawTable)
      .values({
        id: `draw-${id}`,
        campaignId,
        createdAt: new Date((startedS + 10) * 1000),
        lotteryId: draw.lottery || draw.prize ? "l1" : null,
        prizeId: draw.prize ? "p1" : null,
        prizeTitle: draw.prize ? "Sticker" : null,
        ticketRef: draw.ticketRef,
      })
      .run();
  }
  const at = (s: number) => new Date(s * 1000);
  db.insert(visitTable)
    .values({
      id,
      campaignId,
      startedAt: at(startedS),
      capturedAt: captured ? at(startedS + 10) : null,
      drawId: draw ? `draw-${id}` : null,
      printedAt: endReason === "completed" ? at(startedS + lengthS) : null,
      endedAt: endReason ? at(startedS + lengthS) : null,
      endReason,
      updatedAt: at(startedS + lengthS),
    })
    .run();
}

/** The event, its lottery and one prize, for visits that drew. */
function setupWithLottery() {
  const context = setup();
  context.db.insert(lotteryTable).values({ id: "l1" }).run();
  context.db
    .insert(prizeTable)
    .values({
      id: "p1",
      lotteryId: "l1",
      title: "Sticker",
      winInstruction: "Bar",
    })
    .run();
  context.db
    .insert(stockAdjustmentTable)
    .values({ id: "s1", prizeId: "p1", delta: 10, reason: "initial" })
    .run();
  context.db
    .insert(campaignTable)
    .values({ id: "c0", name: "Last week", status: "archived" })
    .run();
  return context;
}

/** Sets the active event's start and end, in seconds; null leaves it open. */
function setTimes(db: DB, startsS: number | null, endsS: number | null) {
  db.update(campaignTable)
    .set({
      startsAt: startsS === null ? null : new Date(startsS * 1000),
      endsAt: endsS === null ? null : new Date(endsS * 1000),
    })
    .where(eq(campaignTable.id, "c1"))
    .run();
}

const statsAt = (db: DB, seconds: number) =>
  getVisitStatsForDb(db, new Date(seconds * 1000))!;

describe("getVisitStatsForDb", () => {
  test("is null without an active event", () => {
    const { db } = setup({ campaign: false });

    expect(getVisitStatsForDb(db)).toBeNull();
  });

  test("counts the active event's visits, step by step", () => {
    const { db } = setupWithLottery();
    seedVisit(db, "won", 10 * HOUR, {
      lengthS: 80,
      draw: { ticketRef: "000001", prize: true },
    });
    seedVisit(db, "lost", 10 * HOUR + 100, {
      lengthS: 40,
      draw: { ticketRef: "000002", lottery: true },
    });
    seedVisit(db, "no-lottery", 10 * HOUR + 200, {
      draw: { ticketRef: "000003" },
    });
    seedVisit(db, "failed", 10 * HOUR + 300, {
      endReason: "failed",
      draw: { ticketRef: "000004" },
    });
    seedVisit(db, "walked-away", 10 * HOUR + 400, {
      endReason: "abandoned",
      captured: false,
    });
    seedVisit(db, "open", 10 * HOUR + 500, {
      endReason: null,
      captured: false,
    });
    seedVisit(db, "other-event", 10 * HOUR, { campaignId: "c0" });

    expect(statsAt(db, 10 * HOUR + 600)).toMatchObject({
      visits: 6,
      captured: 4,
      prints: 3,
      failed: 1,
      abandoned: 1,
      wins: 1,
      losses: 1,
      avgDurationS: 60,
      firstVisitAt: new Date(10 * HOUR * 1000).toISOString(),
      lastVisitAt: new Date((10 * HOUR + 500) * 1000).toISOString(),
    });
  });

  test("leaves a backfilled visit, one time for everything, out of the average", () => {
    const { db } = setup();
    seedVisit(db, "backfill", 10 * HOUR, { lengthS: 0 });
    seedVisit(db, "real", 10 * HOUR + 100, { lengthS: 90 });

    expect(statsAt(db, 11 * HOUR).avgDurationS).toBe(90);
  });

  test("counts the visits of the last 15 minutes", () => {
    const { db } = setup();
    seedVisit(db, "before", 10 * HOUR - 15 * 60 - 1);
    seedVisit(db, "edge", 10 * HOUR - 15 * 60);
    seedVisit(db, "now", 10 * HOUR - 1);

    expect(statsAt(db, 10 * HOUR).recentVisits).toBe(2);
  });

  test("covers the event from its first visit's hour to now, empty hours included", () => {
    const { db } = setup();
    seedVisit(db, "a", 20 * HOUR + 600);
    seedVisit(db, "b", 22 * HOUR + 10);
    seedVisit(db, "c", 22 * HOUR + 900);

    const { hourly } = statsAt(db, 23 * HOUR + 60);

    expect(hourly).toEqual([
      { hour: new Date(20 * HOUR * 1000).toISOString(), visits: 1 },
      { hour: new Date(21 * HOUR * 1000).toISOString(), visits: 0 },
      { hour: new Date(22 * HOUR * 1000).toISOString(), visits: 2 },
      { hour: new Date(23 * HOUR * 1000).toISOString(), visits: 0 },
    ]);
  });

  test("has no hours before the first visit", () => {
    const { db } = setup();

    expect(statsAt(db, 23 * HOUR)).toMatchObject({
      visits: 0,
      hourly: [],
      busiestHour: null,
      firstVisitAt: null,
      lastVisitAt: null,
    });
  });

  test("keeps the hours of a long event to the most recent ones", () => {
    const { db } = setup();
    seedVisit(db, "day-one", 10 * HOUR);
    seedVisit(db, "day-two", 40 * HOUR);

    const { hourly, visits } = statsAt(db, 40 * HOUR + 60);

    expect(visits).toBe(2);
    expect(hourly).toHaveLength(VISIT_STATS_HOURS);
    expect(hourly.at(-1)).toEqual({
      hour: new Date(40 * HOUR * 1000).toISOString(),
      visits: 1,
    });
    expect(hourly[0]?.hour).toBe(
      new Date((40 - VISIT_STATS_HOURS + 1) * HOUR * 1000).toISOString(),
    );
  });

  test("takes the busiest hour from the whole event, the latest on a tie", () => {
    const { db } = setup();
    // Three guests on day one, out of the hours shown on day two.
    seedVisit(db, "a", 10 * HOUR);
    seedVisit(db, "b", 10 * HOUR + 60);
    seedVisit(db, "c", 10 * HOUR + 120);
    seedVisit(db, "d", 40 * HOUR);
    seedVisit(db, "e", 41 * HOUR);
    seedVisit(db, "f", 41 * HOUR + 60);
    seedVisit(db, "g", 41 * HOUR + 120);

    expect(statsAt(db, 41 * HOUR + 600).busiestHour).toEqual({
      hour: new Date(41 * HOUR * 1000).toISOString(),
      visits: 3,
    });
  });

  test("lists the latest failed prints, newest first, with their ticket numbers", () => {
    const { db } = setup();
    for (let index = 0; index < VISIT_STATS_FAILED_LIMIT + 1; index += 1) {
      seedVisit(db, `failed-${index}`, 10 * HOUR + index * 60, {
        endReason: "failed",
        draw: index === 0 ? undefined : { ticketRef: `00000${index}` },
      });
    }

    const { failed, failedVisits } = statsAt(db, 11 * HOUR);

    expect(failed).toBe(VISIT_STATS_FAILED_LIMIT + 1);
    expect(failedVisits).toHaveLength(VISIT_STATS_FAILED_LIMIT);
    expect(failedVisits[0]).toEqual({
      startedAt: new Date(
        (10 * HOUR + VISIT_STATS_FAILED_LIMIT * 60) * 1000,
      ).toISOString(),
      ticketRef: `00000${VISIT_STATS_FAILED_LIMIT}`,
    });
  });

  test("knows when the event's last win was, ignoring losses", () => {
    const { db } = setupWithLottery();
    seedVisit(db, "won", 10 * HOUR, { draw: { ticketRef: "1", prize: true } });
    seedVisit(db, "lost", 10 * HOUR + 600, {
      draw: { ticketRef: "2", lottery: true },
    });
    seedVisit(db, "won-elsewhere", 10 * HOUR + 900, {
      campaignId: "c0",
      draw: { ticketRef: "3", prize: true },
    });

    expect(statsAt(db, 11 * HOUR).lastWinAt).toBe(
      new Date((10 * HOUR + 10) * 1000).toISOString(),
    );
  });

  test("counts only visits between the event's start and end, and says how many it left out", () => {
    const { db } = setup();
    setTimes(db, 19 * HOUR, 26 * HOUR);
    seedVisit(db, "setup-test", 18 * HOUR, { endReason: "failed" });
    seedVisit(db, "a", 20 * HOUR);
    seedVisit(db, "b", 21 * HOUR, { endReason: "abandoned" });
    seedVisit(db, "packing-up", 26 * HOUR);

    expect(statsAt(db, 27 * HOUR)).toMatchObject({
      visits: 2,
      prints: 1,
      abandoned: 1,
      failed: 0,
      failedVisits: [],
      uncounted: 2,
      firstVisitAt: new Date(20 * HOUR * 1000).toISOString(),
      lastVisitAt: new Date(21 * HOUR * 1000).toISOString(),
      busiestHour: {
        hour: new Date(21 * HOUR * 1000).toISOString(),
        visits: 1,
      },
    });
  });

  test("runs the hours from the start, empty ones included, to now", () => {
    const { db } = setup();
    setTimes(db, 19 * HOUR + 1_800, null);
    seedVisit(db, "a", 21 * HOUR);

    const { hourly } = statsAt(db, 22 * HOUR + 60);

    expect(hourly.map((entry) => entry.visits)).toEqual([0, 0, 1, 0]);
    expect(hourly[0]?.hour).toBe(new Date(19 * HOUR * 1000).toISOString());
  });

  test("stops the hours at the end", () => {
    const { db } = setup();
    setTimes(db, 19 * HOUR, 24 * HOUR);
    seedVisit(db, "a", 23 * HOUR + 600);

    const { hourly, recentVisits } = statsAt(db, 30 * HOUR);

    expect(hourly).toHaveLength(5);
    expect(hourly.at(-1)).toEqual({
      hour: new Date(23 * HOUR * 1000).toISOString(),
      visits: 1,
    });
    expect(recentVisits).toBe(0);
  });

  test("counts nothing before the start", () => {
    const { db } = setup();
    setTimes(db, 30 * HOUR, null);
    seedVisit(db, "setup-test", 19 * HOUR);

    expect(statsAt(db, 20 * HOUR)).toMatchObject({
      visits: 0,
      uncounted: 1,
      hourly: [],
      busiestHour: null,
      recentVisits: 0,
    });
  });

  test("counts every visit while the event has no start or end", () => {
    const { db } = setup();
    seedVisit(db, "a", 19 * HOUR);

    expect(statsAt(db, 20 * HOUR)).toMatchObject({
      visits: 1,
      uncounted: 0,
    });
  });
});

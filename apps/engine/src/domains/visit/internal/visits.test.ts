import { afterEach, describe, expect, test } from "bun:test";

import type { DB } from "#db/internal/db.types";

import { campaignTable, drawTable, visitTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";

import { getVisitStatsForDb } from "./visit.stats";
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

  test("a draw without a visit starts one, closing any left open", () => {
    const { db, visits } = setup();

    const { visitId: open } = visits.start();
    const linked = draw(db, visits, null, "000001");

    expect(linked).toEqual(expect.any(String));
    expect(linked).not.toBe(open);
    expect(rows(db)).toMatchObject([
      { id: open, endReason: "abandoned", drawId: null },
      { id: linked, drawId: "draw-000001", endedAt: null },
    ]);
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

describe("getVisitStatsForDb", () => {
  test("is null without an active event", () => {
    const { db } = setup({ campaign: false });

    expect(getVisitStatsForDb(db)).toBeNull();
  });

  test("counts the active event's visits", () => {
    const { db, tick, visits } = setup();
    db.insert(drawTable)
      .values({ id: "won", campaignId: "c1", ticketRef: "000009" })
      .run();
    // A backfilled visit: one time for everything, so no length.
    db.insert(visitTable)
      .values({
        id: "backfill-won",
        campaignId: "c1",
        startedAt: new Date(0),
        drawId: "won",
        printedAt: new Date(0),
        endedAt: new Date(0),
        endReason: "completed",
        updatedAt: new Date(0),
      })
      .run();

    const completed = visits.start().visitId!;
    draw(db, visits, completed, "000001");
    visits.printed("000001", true);
    tick(40);
    visits.end(completed, "completed");
    const failed = visits.start().visitId!;
    visits.end(failed, "failed");
    visits.start();

    expect(getVisitStatsForDb(db)).toEqual({
      visits: 4,
      completed: 2,
      prints: 2,
      wins: 0,
      avgDurationS: 40,
    });
  });
});

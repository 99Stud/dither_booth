import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runSqliteMigrations } from "./db.migrations";
import { dbSchema } from "./db.schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

type Journal = { entries: Array<{ tag: string }> };

const tempDirs: string[] = [];
const openDbs: Database[] = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

/** A migrations folder holding only the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const folder = mkdtempSync(join(tmpdir(), "dither-migrations-"));
  tempDirs.push(folder);
  mkdirSync(join(folder, "meta"));

  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
  ) as Journal;
  const entries = journal.entries.slice(0, count);

  for (const { tag } of entries) {
    copyFileSync(
      join(MIGRATIONS_FOLDER, `${tag}.sql`),
      join(folder, `${tag}.sql`),
    );
  }
  writeFileSync(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );

  return folder;
}

function openDb({ foreignKeys }: { foreignKeys: boolean }) {
  const sqlite = new Database(":memory:");
  openDbs.push(sqlite);
  sqlite.run(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  return { sqlite, db: drizzle({ client: sqlite, schema: dbSchema }) };
}

/** Stock derived from the ledger, the way the engine computes it. */
const stockByPrize = (sqlite: Database) =>
  sqlite
    .query(
      `SELECT
        id,
        COALESCE((SELECT SUM(delta) FROM stock_adjustment WHERE prize_id = prize.id), 0) AS total,
        COALESCE((SELECT SUM(delta) FROM stock_adjustment WHERE prize_id = prize.id), 0)
          - (SELECT COUNT(*) FROM draw WHERE prize_id = prize.id) AS remaining
      FROM prize
      ORDER BY id`,
    )
    .all();

const STOCK_TRIGGERS = [
  "draw_requires_stock",
  "stock_adjustment_keeps_stock_non_negative",
];

const triggerNames = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
    )
    .all()
    .map((row) => row.name);

const foreignKeysEnabled = (sqlite: Database) =>
  sqlite.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()
    ?.foreign_keys === 1;

/**
 * A booth that ran the branch up to 0003 (lottery weights) and already has a
 * won draw pointing at a prize, which every later table rebuild must carry.
 */
function seedAtLotteryWeights(sqlite: Database) {
  sqlite.run(
    "INSERT INTO lottery (id, enabled, no_win_weight, win_cooldown_minutes) VALUES ('l1', 1, 10, 5)",
  );
  sqlite.run(
    "INSERT INTO campaign (id, name, lottery_id) VALUES ('c1', 'Launch', 'l1')",
  );
  sqlite.run(
    "INSERT INTO prize (id, lottery_id, win_description, weight, total_quantity, remaining_quantity, rarity) VALUES ('p1', 'l1', 'a sticker', 1, 5, 4, 'rare')",
  );
  sqlite.run(
    "INSERT INTO draw (id, created_at, lottery_id, prize_id) VALUES ('d1', '1700000000', 'l1', 'p1'), ('d2', '1700000060', 'l1', NULL)",
  );
}

describe("runSqliteMigrations", () => {
  test("migrates a fresh database and leaves foreign keys on", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    expect(foreignKeysEnabled(sqlite)).toBe(true);
    expect(
      sqlite
        .query<{ name: string }, []>("PRAGMA table_info(draw)")
        .all()
        .map((column) => column.name),
    ).toContain("prize_title");
  });

  test("is idempotent", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    const run = () =>
      runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    run();
    expect(run()).toEqual([]);
  });

  test("rebuilds tables that hold referenced rows while FKs are enforced", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(4), sqlite });
    seedAtLotteryWeights(sqlite);

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    expect(foreignKeysEnabled(sqlite)).toBe(true);
    expect(
      sqlite
        .query("SELECT id, prize_id, prize_title FROM draw ORDER BY id")
        .all(),
    ).toEqual([
      { id: "d1", prize_id: "p1", prize_title: "a sticker" },
      { id: "d2", prize_id: null, prize_title: null },
    ]);
    expect(sqlite.query("SELECT id, title, removed FROM prize").all()).toEqual([
      { id: "p1", title: "a sticker", removed: 0 },
    ]);
    expect(stockByPrize(sqlite)).toEqual([
      { id: "p1", total: 5, remaining: 4 },
    ]);
  });

  test("plain drizzle migrate would fail on the same upgrade with FKs on", () => {
    // Control for the test above: this is what runSqliteMigrations guards
    // against. The migrations' own `PRAGMA foreign_keys=OFF` is ignored
    // inside drizzle's transaction, so dropping `prize` trips the FK.
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(4), sqlite });
    seedAtLotteryWeights(sqlite);

    let failure: unknown;
    try {
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).cause)).toMatch(/FOREIGN KEY/);
  });

  test("moves a booth on the old Burkes default to blue noise", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(12), sqlite });
    sqlite.run("INSERT INTO print_config (id, exposure) VALUES (1, 1.5)");

    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    expect(
      sqlite
        .query(
          "SELECT dither_mode_code, exposure, tone_gamma FROM print_config",
        )
        .all(),
    ).toEqual([{ dither_mode_code: 10, exposure: 1.5, tone_gamma: 1.8 }]);
  });

  test("keeps a dither mode the booth picked on purpose", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(12), sqlite });
    sqlite.run("INSERT INTO print_config (id, dither_mode_code) VALUES (1, 4)");

    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    expect(
      sqlite.query("SELECT dither_mode_code FROM print_config").all(),
    ).toEqual([{ dither_mode_code: 4 }]);
  });

  test("reports legacy orphans without refusing to boot", () => {
    const { sqlite, db } = openDb({ foreignKeys: false });
    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    sqlite.run("PRAGMA foreign_keys = OFF");
    // An orphan lottery, not prize: the stock trigger stops a win on an
    // unknown prize before the row exists.
    sqlite.run(
      "INSERT INTO draw (id, lottery_id, ticket_ref) VALUES ('orphan', 'ghost-lottery', '123456')",
    );

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toMatchObject([{ table: "draw", parent: "lottery" }]);
    expect(foreignKeysEnabled(sqlite)).toBe(true);
  });

  test("0011 carries every prize's stock into the ledger", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    // Up to and including 0010: the last schema with stock columns.
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(11), sqlite });

    sqlite.run("INSERT INTO lottery (id) VALUES ('l1')");
    const insertPrize = sqlite.prepare(
      "INSERT INTO prize (id, lottery_id, title, win_instruction, total_quantity, remaining_quantity, removed) VALUES (?, 'l1', ?, 'Bar', ?, ?, ?)",
    );
    insertPrize.run("drained", "half won", 10, 4, 0);
    insertPrize.run("fresh", "untouched", 5, 5, 0);
    // Soft-deleted after a win: remaining was zeroed, total kept.
    insertPrize.run("gone", "removed", 3, 0, 1);
    insertPrize.run("empty", "no stock", 0, 0, 0);

    const insertWin = sqlite.prepare(
      "INSERT INTO draw (id, lottery_id, prize_id, ticket_ref) VALUES (?, 'l1', ?, ?)",
    );
    for (let i = 0; i < 6; i++) {
      insertWin.run(`w${i}`, "drained", `00000${i}`);
    }
    insertWin.run("w-gone", "gone", "000099");

    const before = sqlite
      .query(
        "SELECT id, remaining_quantity AS remaining FROM prize ORDER BY id",
      )
      .all() as Array<{ id: string; remaining: number }>;

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    const after = stockByPrize(sqlite) as Array<{
      id: string;
      remaining: number;
      total: number;
    }>;
    expect(after.map(({ id, remaining }) => ({ id, remaining }))).toEqual(
      before,
    );
    expect(after).toEqual([
      { id: "drained", total: 10, remaining: 4 },
      { id: "empty", total: 0, remaining: 0 },
      { id: "fresh", total: 5, remaining: 5 },
      { id: "gone", total: 1, remaining: 0 },
    ]);
    expect(
      sqlite
        .query("SELECT id, delta, reason FROM stock_adjustment ORDER BY id")
        .all(),
    ).toEqual([
      { id: "backfill-correction-gone", delta: -2, reason: "correction" },
      { id: "backfill-initial-drained", delta: 10, reason: "initial" },
      { id: "backfill-initial-fresh", delta: 5, reason: "initial" },
      { id: "backfill-initial-gone", delta: 3, reason: "initial" },
    ]);
    expect(
      sqlite
        .query<{ name: string }, []>("PRAGMA table_info(prize)")
        .all()
        .map((column) => column.name),
    ).not.toContain("remaining_quantity");
  });

  test("0013 keeps one event active and ties past draws to it", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    // Up to and including 0012: the last schema without event lifecycle.
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(13), sqlite });

    sqlite.run("INSERT INTO lottery (id, enabled) VALUES ('l1', 1)");
    // A dev database seeded next to an admin-created event holds two.
    sqlite.run(
      "INSERT INTO campaign (id, name, lottery_id) VALUES ('c1', 'Admin event', 'l1'), ('c2', 'Dev event', NULL)",
    );
    sqlite.run(
      "INSERT INTO prize (id, lottery_id, title, win_instruction) VALUES ('p1', 'l1', 'sticker', 'Bar')",
    );
    sqlite.run(
      "INSERT INTO stock_adjustment (id, prize_id, delta, reason) VALUES ('s1', 'p1', 3, 'initial')",
    );
    sqlite.run(
      "INSERT INTO draw (id, lottery_id, prize_id, ticket_ref) VALUES ('win', 'l1', 'p1', '000001'), ('loss', 'l1', NULL, '000002'), ('off', NULL, NULL, '000003')",
    );

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    expect(
      sqlite.query("SELECT id, status FROM campaign ORDER BY id").all(),
    ).toEqual([
      { id: "c1", status: "active" },
      { id: "c2", status: "archived" },
    ]);
    // Recorded while no lottery was enabled, so it can't be placed.
    expect(
      sqlite.query("SELECT id, campaign_id FROM draw ORDER BY id").all(),
    ).toEqual([
      { id: "loss", campaign_id: "c1" },
      { id: "off", campaign_id: null },
      { id: "win", campaign_id: "c1" },
    ]);
    expect(triggerNames(sqlite)).toEqual(STOCK_TRIGGERS);
    expect(() =>
      sqlite.run("INSERT INTO campaign (id, name) VALUES ('c3', 'Twin')"),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      sqlite.run(
        "INSERT INTO campaign (id, name, status) VALUES ('c3', 'Odd', 'paused')",
      ),
    ).toThrow(/CHECK constraint failed/);
  });

  test("0014–0015 move the receipt template from the device to each event", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    // Up to and including 0013: the last schema with print_config.template.
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(14), sqlite });

    // Heirvey has since been removed from the release: the backfill copies
    // whatever the device had, and the engine falls back when reading it.
    sqlite.run(
      "INSERT INTO print_config (id, template, threshold) VALUES (1, 'heirvey', 100)",
    );
    sqlite.run(
      "INSERT INTO campaign (id, name, status) VALUES ('c1', 'Current', 'active'), ('c2', 'Past', 'archived')",
    );

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    expect(
      sqlite.query("SELECT id, kit_id FROM campaign ORDER BY id").all(),
    ).toEqual([
      { id: "c1", kit_id: "heirvey" },
      { id: "c2", kit_id: "heirvey" },
    ]);
    expect(
      sqlite
        .query<{ name: string }, []>("PRAGMA table_info(print_config)")
        .all()
        .map((column) => column.name),
    ).not.toContain("template");
    expect(
      sqlite.query("SELECT threshold, tone_gamma FROM print_config").all(),
    ).toEqual([{ threshold: 100, tone_gamma: 1.8 }]);
    // Free text: a kit from a newer release is stored as is.
    sqlite.run(
      "INSERT INTO campaign (id, name, status, kit_id) VALUES ('c3', 'Next', 'archived', 'halloween-2099')",
    );
    expect(() =>
      sqlite.run("INSERT INTO print_config (id, exposure) VALUES (2, 1)"),
    ).toThrow(/CHECK constraint failed/);
  });

  test("0016 keeps a single Darkroom PIN row", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    sqlite.run("INSERT INTO darkroom_access (pin_hash) VALUES ('hash')");

    expect(
      sqlite.query("SELECT id, pin_hash FROM darkroom_access").all(),
    ).toEqual([{ id: 1, pin_hash: "hash" }]);
    expect(() =>
      sqlite.run("INSERT INTO darkroom_access (id, pin_hash) VALUES (2, 'x')"),
    ).toThrow(/CHECK constraint failed/);
  });

  test("0017 keeps a single maintenance row, off by default", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    sqlite.run("INSERT INTO kiosk_maintenance DEFAULT VALUES");

    expect(
      sqlite.query("SELECT id, enabled FROM kiosk_maintenance").all(),
    ).toEqual([{ id: 1, enabled: 0 }]);
    expect(() =>
      sqlite.run("INSERT INTO kiosk_maintenance (id, enabled) VALUES (2, 1)"),
    ).toThrow(/CHECK constraint failed/);
  });

  test("0021 turns upside-down tickets on and keeps the booth's tuning", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    // Up to and including 0020: the last schema without upside_down.
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(21), sqlite });
    sqlite.run("INSERT INTO print_config (id, threshold) VALUES (1, 100)");

    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    expect(
      sqlite.query("SELECT threshold, upside_down FROM print_config").all(),
    ).toEqual([{ threshold: 100, upside_down: 1 }]);
    expect(() => sqlite.run("UPDATE print_config SET upside_down = 2")).toThrow(
      /CHECK constraint failed/,
    );
  });

  test("leaves the stock triggers and prize checks in place", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    // A later migration that rebuilds `draw` or `stock_adjustment` drops
    // these silently, since drizzle-kit does not track triggers.
    expect(triggerNames(sqlite)).toEqual(STOCK_TRIGGERS);

    sqlite.run("INSERT INTO lottery (id) VALUES ('l1')");
    expect(() =>
      sqlite.run(
        "INSERT INTO prize (id, lottery_id, title, win_instruction, weight) VALUES ('p', 'l1', 't', 'w', 0)",
      ),
    ).toThrow(/CHECK constraint failed/);
  });
});

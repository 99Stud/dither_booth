import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runSqliteMigrations } from "./db.migrations";
import { dbRelations } from "./db.schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

const tempDirs: string[] = [];
const openDbs: Database[] = [];

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

/** Migration folder names, oldest first: each starts with its UTC timestamp. */
const migrationNames = () =>
  readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

/** A migrations folder holding only the first `count` migrations. */
function migrationsUpTo(count: number): string {
  const folder = mkdtempSync(join(tmpdir(), "dither-migrations-"));
  tempDirs.push(folder);

  for (const name of migrationNames().slice(0, count)) {
    cpSync(join(MIGRATIONS_FOLDER, name), join(folder, name), {
      recursive: true,
    });
  }

  return folder;
}

/**
 * Applies the first `count` migrations the way drizzle-orm 0.x did, and
 * records them in its three-column `__drizzle_migrations`: the SQL file's
 * hash and the journal's `when` in milliseconds. Booths in the field were
 * migrated like this before the move to drizzle v1.
 */
function migrateLikeDrizzleV0(sqlite: Database, count: number) {
  sqlite.run(
    "CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)",
  );
  for (const name of migrationNames().slice(0, count)) {
    const query = readFileSync(
      join(MIGRATIONS_FOLDER, name, "migration.sql"),
      "utf8",
    );
    for (const statement of query.split("--> statement-breakpoint")) {
      sqlite.run(statement);
    }
    // The journal kept milliseconds; the folder name keeps seconds.
    const when = Date.UTC(
      Number(name.slice(0, 4)),
      Number(name.slice(4, 6)) - 1,
      Number(name.slice(6, 8)),
      Number(name.slice(8, 10)),
      Number(name.slice(10, 12)),
      Number(name.slice(12, 14)),
      576,
    );
    sqlite.run(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      [new Bun.CryptoHasher("sha256").update(query).digest("hex"), when],
    );
  }
}

function openDb({ foreignKeys }: { foreignKeys: boolean }) {
  const sqlite = new Database(":memory:");
  openDbs.push(sqlite);
  sqlite.run(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  return { sqlite, db: drizzle({ client: sqlite, relations: dbRelations }) };
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

  test("takes over a booth migrated by drizzle 0.x without re-running", () => {
    const { sqlite, db } = openDb({ foreignKeys: false });
    // Up to and including 0022: the booth is one migration behind.
    migrateLikeDrizzleV0(sqlite, 23);
    sqlite.run("INSERT INTO campaign (id, name) VALUES ('c1', 'Halloween')");

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toEqual([]);
    const names = migrationNames();
    const applied = sqlite
      .query<{ id: number; name: string; applied_at: string | null }, []>(
        "SELECT id, name, applied_at FROM __drizzle_migrations ORDER BY id",
      )
      .all();
    expect(applied.map((row) => row.name)).toEqual(names);
    // Rows from 0.x are adopted as they were; only the pending one ran now.
    expect(applied.filter((row) => row.applied_at !== null)).toEqual([
      expect.objectContaining({ name: names.at(-1) }),
    ]);
    expect(sqlite.query("SELECT id, name FROM campaign").all()).toEqual([
      { id: "c1", name: "Halloween" },
    ]);
    expect(
      sqlite
        .query<{ name: string }, []>("PRAGMA table_info(visit)")
        .all()
        .map((column) => column.name),
    ).toContain("draw_id");
  });

  test("retires rows drizzle 0.x kept for migrations no longer in the folder", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    migrateLikeDrizzleV0(sqlite, migrationNames().length);
    // Ran from a branch whose migration was regenerated before it merged.
    sqlite.run(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('gone', 1784383719657)",
    );

    expect(
      runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite }),
    ).toEqual([]);

    expect(
      sqlite
        .query("SELECT hash, created_at FROM __drizzle_migrations_retired")
        .all(),
    ).toEqual([{ hash: "gone", created_at: 1784383719657 }]);
    expect(
      sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM __drizzle_migrations ORDER BY rowid",
        )
        .all()
        .map((row) => row.name),
    ).toEqual(migrationNames());
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

  test("0023 gives every earlier draw one completed visit", () => {
    const { sqlite, db } = openDb({ foreignKeys: true });
    // Up to and including 0022: the last schema without visits.
    runSqliteMigrations({ db, migrationsFolder: migrationsUpTo(23), sqlite });
    sqlite.run("INSERT INTO campaign (id, name) VALUES ('c1', 'Halloween')");
    sqlite.run(
      "INSERT INTO draw (id, created_at, campaign_id, ticket_ref) VALUES ('d1', 1000, 'c1', '000001'), ('d2', 2000, NULL, '000002')",
    );

    // The backfill's references hold: no foreign key violation after it.
    expect(
      runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite }),
    ).toEqual([]);

    expect(
      sqlite
        .query(
          "SELECT id, campaign_id, started_at, captured_at, draw_id, printed_at, print_attempts, ended_at, end_reason, updated_at, reported_at FROM visit ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: "backfill-d1",
        campaign_id: "c1",
        started_at: 1000,
        captured_at: 1000,
        draw_id: "d1",
        printed_at: 1000,
        print_attempts: 1,
        ended_at: 1000,
        end_reason: "completed",
        updated_at: 1000,
        reported_at: null,
      },
      {
        id: "backfill-d2",
        campaign_id: null,
        started_at: 2000,
        captured_at: 2000,
        draw_id: "d2",
        printed_at: 2000,
        print_attempts: 1,
        ended_at: 2000,
        end_reason: "completed",
        updated_at: 2000,
        reported_at: null,
      },
    ]);
    expect(() =>
      sqlite.run(
        "INSERT INTO visit (id, started_at, draw_id, updated_at) VALUES ('v', 1, 'd1', 1)",
      ),
    ).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      sqlite.run(
        "INSERT INTO visit (id, started_at, end_reason, updated_at) VALUES ('v', 1, 'gone', 1)",
      ),
    ).toThrow(/CHECK constraint failed/);
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

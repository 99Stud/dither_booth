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
    expect(
      sqlite
        .query("SELECT id, title, remaining_quantity, removed FROM prize")
        .all(),
    ).toEqual([
      { id: "p1", title: "a sticker", remaining_quantity: 4, removed: 0 },
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

  test("reports legacy orphans without refusing to boot", () => {
    const { sqlite, db } = openDb({ foreignKeys: false });
    runSqliteMigrations({ db, migrationsFolder: MIGRATIONS_FOLDER, sqlite });

    sqlite.run("PRAGMA foreign_keys = OFF");
    sqlite.run(
      "INSERT INTO draw (id, prize_id, ticket_ref) VALUES ('orphan', 'ghost-prize', '123456')",
    );

    const violations = runSqliteMigrations({
      db,
      migrationsFolder: MIGRATIONS_FOLDER,
      sqlite,
    });

    expect(violations).toMatchObject([{ table: "draw", parent: "prize" }]);
    expect(foreignKeysEnabled(sqlite)).toBe(true);
  });
});

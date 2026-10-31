import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { backupDatabase, backupStamp } from "./database-backup";

let root: string;
let db: Database;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "database-backup-"));
  db = new Database(join(root, "live.sqlite"));
  db.run("CREATE TABLE draw (id TEXT)");
  db.run("INSERT INTO draw VALUES ('a')");
});

afterEach(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});

describe("backupStamp", () => {
  test("sorts in time order and holds no colon or dot", () => {
    const stamp = backupStamp(new Date("2026-10-31T19:05:00.000Z"));
    expect(stamp).toBe("2026-10-31T19-05-00-000Z");
  });
});

describe("backupDatabase", () => {
  test("copies what the database holds", async () => {
    const dest = await backupDatabase(db, {
      dir: join(root, "backups"),
      prefix: "event-",
      label: "one",
      keep: 3,
    });

    const copy = new Database(dest, { readonly: true });
    expect(copy.query("SELECT id FROM draw").all()).toEqual([{ id: "a" }]);
    copy.close();
  });

  test("keeps the newest of its prefix and leaves other files alone", async () => {
    const dir = join(root, "backups");
    await backupDatabase(db, { dir, prefix: "update-", label: "x", keep: 3 });
    await writeFile(join(dir, "event-notes.txt"), "");

    for (const label of ["1", "2", "3", "4"]) {
      await backupDatabase(db, { dir, prefix: "event-", label, keep: 2 });
    }

    expect((await readdir(dir)).toSorted()).toEqual([
      "event-3.sqlite",
      "event-4.sqlite",
      "event-notes.txt",
      "update-x.sqlite",
    ]);
  });
});

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  backupDatabase,
  backupStamp,
  listBackupFiles,
  parseBackupName,
} from "./database-backup";

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
  test("holds no colon or dot", () => {
    const stamp = backupStamp(new Date("2026-10-31T19:05:00.000Z"));
    expect(stamp).toBe("2026-10-31T19-05-00-000Z");
  });
});

describe("parseBackupName", () => {
  test("reads the kind, the sequence and the time", () => {
    expect(
      parseBackupName("event-00000042-2026-10-31T19-05-00-000Z-start.sqlite"),
    ).toEqual({
      kind: "event",
      sequence: 42,
      takenAt: new Date("2026-10-31T19:05:00.000Z"),
    });
  });

  test("reads an update backup named before sequences as the oldest", () => {
    expect(
      parseBackupName("update-2026-10-30T18-13-24-029Z-0.9.0-to-0.9.1.sqlite"),
    ).toMatchObject({ kind: "update", sequence: 0 });
  });

  test("ignores any other file", () => {
    expect(parseBackupName("event-notes.txt")).toBeNull();
    expect(parseBackupName("dither-booth.sqlite")).toBeNull();
  });
});

describe("backupDatabase", () => {
  test("copies what the database holds", async () => {
    const dest = await backupDatabase(db, {
      dir: join(root, "backups"),
      kind: "event",
      label: "one",
    });

    const copy = new Database(dest, { readonly: true });
    expect(copy.query("SELECT id FROM draw").all()).toEqual([{ id: "a" }]);
    copy.close();
  });

  test("keeps the newest of its kind by sequence, whatever the clock said", async () => {
    const dir = join(root, "backups");
    await backupDatabase(db, { dir, kind: "update", label: "x" });
    await writeFile(join(dir, "event-notes.txt"), "");

    // The clock went back an hour between the second and the third.
    for (const label of ["19-00", "19-05", "18-10", "18-15"]) {
      await backupDatabase(db, { dir, kind: "event", label, keep: 2 });
    }

    expect((await readdir(dir)).toSorted()).toEqual([
      "event-00000003-18-10.sqlite",
      "event-00000004-18-15.sqlite",
      "event-notes.txt",
      "update-00000001-x.sqlite",
    ]);
  });

  test("prunes update backups named before sequences first", async () => {
    const dir = join(root, "backups");
    await mkdir(dir);
    for (const stamp of ["2026-10-30T18", "2026-10-30T22", "2026-10-30T23"]) {
      await writeFile(join(dir, `update-${stamp}-old.sqlite`), "");
    }

    await backupDatabase(db, { dir, kind: "update", label: "new" });

    expect((await listBackupFiles(dir, "update")).map((b) => b.name)).toEqual([
      "update-00000001-new.sqlite",
      "update-2026-10-30T23-old.sqlite",
      "update-2026-10-30T22-old.sqlite",
    ]);
  });
});

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readStaffPinSet } from "#internal/staff-pin";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function engineDb(setup: (db: Database) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "booth-pin-"));
  dirs.push(dir);
  const path = join(dir, "dither-booth.sqlite");
  const db = new Database(path);
  setup(db);
  db.close();
  return path;
}

const TABLE =
  "create table darkroom_access (id integer primary key, pin_hash text, updated_at integer)";

describe("readStaffPinSet", () => {
  test("says when a PIN is set", () => {
    const path = engineDb((db) => {
      db.run(TABLE);
      db.run("insert into darkroom_access values (1, '$argon2id$x', 0)");
    });
    expect(readStaffPinSet(path)).toEqual({ set: true });
  });

  test("says when none is", () => {
    expect(readStaffPinSet(engineDb((db) => db.run(TABLE)))).toEqual({
      set: false,
    });
  });

  test("says why when it can't tell (no such table: migrations not run)", () => {
    expect(readStaffPinSet(engineDb(() => {}))).toEqual({
      unreadable: expect.stringContaining("no such table"),
    });
  });
});

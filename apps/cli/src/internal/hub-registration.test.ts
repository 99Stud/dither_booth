import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readHubRegistration } from "#internal/hub-registration";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function engineDb(setup: (db: Database) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "booth-doctor-"));
  dirs.push(dir);
  const path = join(dir, "dither-booth.sqlite");
  const db = new Database(path);
  setup(db);
  db.close();
  return path;
}

const TABLE =
  "create table hub_registration (id integer primary key, hub_url text, booth_id text, booth_name text, refresh_token text, registered_at integer)";

describe("readHubRegistration", () => {
  test("names the booth it is registered as", () => {
    const path = engineDb((db) => {
      db.run(TABLE);
      db.run(
        "insert into hub_registration values (1, 'https://hub', 'id', 'Booth A', 'secret', 0)",
      );
    });
    expect(readHubRegistration(path)).toEqual({
      registered: true,
      boothName: "Booth A",
    });
  });

  test("says when it isn't registered", () => {
    expect(readHubRegistration(engineDb((db) => db.run(TABLE)))).toEqual({
      registered: false,
    });
  });

  test("says why when it can't tell (no such table: migrations not run)", () => {
    const result = readHubRegistration(engineDb(() => {}));
    expect(result).toEqual({
      unreadable: expect.stringContaining("no such table"),
    });
  });
});

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBackups } from "./event-backups";

let root: string;
let sqlite: Database;
let clock: number;
let busy: boolean;
const logged: { level: string; event: string }[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-backups-"));
  sqlite = new Database(join(root, "live.sqlite"));
  sqlite.run("CREATE TABLE draw (id TEXT)");
  clock = Date.parse("2026-10-31T19:00:00.000Z");
  busy = false;
  logged.length = 0;
});

afterEach(async () => {
  sqlite.close();
  await rm(root, { recursive: true, force: true });
});

const dir = () => join(root, "backups");
const backups = async () =>
  (await readdir(dir()).catch(() => [] as string[])).toSorted();

const settle = () => Bun.sleep(20);

const setup = (dirPath = dir()) =>
  createEventBackups({
    sqlite,
    dir: dirPath,
    isBusy: () => busy,
    log: (level, event) => logged.push({ level, event }),
    now: () => new Date(clock),
    everyMs: 5 * 60_000,
    checkMs: 5,
  });

describe("createEventBackups", () => {
  test("takes one at start", async () => {
    const backups$ = setup();
    backups$.start();
    await settle();
    await backups$.stop();

    expect(await backups()).toEqual([
      "event-2026-10-31T19-00-00-000Z-start.sqlite",
    ]);
  });

  test("takes one every 5 minutes, only when something changed", async () => {
    const backups$ = setup();
    backups$.start();
    await settle();

    // Changed, but too soon.
    sqlite.run("INSERT INTO draw VALUES ('a')");
    clock += 60_000;
    await settle();
    expect(await backups()).toHaveLength(1);

    clock += 4 * 60_000;
    await settle();
    expect((await backups()).at(-1)).toBe(
      "event-2026-10-31T19-05-00-000Z-interval.sqlite",
    );

    // Nothing changed since.
    clock += 10 * 60_000;
    await settle();
    await backups$.stop();
    expect(await backups()).toHaveLength(2);
  });

  test("waits for the print to end", async () => {
    const backups$ = setup();
    backups$.start();
    await settle();

    sqlite.run("INSERT INTO draw VALUES ('a')");
    busy = true;
    clock += 5 * 60_000;
    await settle();
    expect(await backups()).toHaveLength(1);

    busy = false;
    await settle();
    await backups$.stop();
    expect(await backups()).toHaveLength(2);
  });

  test("takes a last one at stop when something changed", async () => {
    const backups$ = setup();
    backups$.start();
    await settle();

    sqlite.run("INSERT INTO draw VALUES ('a')");
    clock += 60_000;
    await backups$.stop();

    expect((await backups()).at(-1)).toBe(
      "event-2026-10-31T19-01-00-000Z-stop.sqlite",
    );
    const copy = new Database(join(dir(), (await backups()).at(-1)!), {
      readonly: true,
    });
    expect(copy.query("SELECT id FROM draw").all()).toEqual([{ id: "a" }]);
    copy.close();
  });

  test("logs a failure instead of throwing", async () => {
    // A file where the folder should be.
    const backups$ = setup(join(root, "live.sqlite"));
    backups$.start();
    await settle();
    await backups$.stop();

    expect(logged).toContainEqual({
      level: "warn",
      event: "event-backup-failed",
    });
  });
});

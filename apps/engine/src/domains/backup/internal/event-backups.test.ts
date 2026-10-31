import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createEventBackups } from "./event-backups";

let root: string;
let sqlite: Database;
/** The booth's clock, which names the files. */
let wallClock: number;
/** Time since the engine started, which spaces them. */
let elapsed: number;
let busy: boolean;
const logged: { level: string; event: string }[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "event-backups-"));
  sqlite = new Database(join(root, "live.sqlite"));
  sqlite.run("CREATE TABLE draw (id TEXT)");
  wallClock = Date.parse("2026-10-31T19:00:00.000Z");
  elapsed = 0;
  busy = false;
  logged.length = 0;
});

afterEach(async () => {
  sqlite.close();
  await rm(root, { recursive: true, force: true });
});

const ssd = () => join(root, "ssd");
const sd = () => join(root, "sd");
const files = async (dir = ssd()) =>
  (await readdir(dir).catch(() => [] as string[])).toSorted();

const settle = () => Bun.sleep(20);
const advance = (ms: number) => {
  wallClock += ms;
  elapsed += ms;
};
const draw = () => sqlite.run("INSERT INTO draw VALUES ('a')");

const createUnderTest = ({ dir = ssd(), mirrorDir = sd() } = {}) =>
  createEventBackups({
    sqlite,
    dir,
    mirrorDir,
    isBusy: () => busy,
    log: (level, event) => logged.push({ level, event }),
    now: () => new Date(wallClock),
    elapsedMs: () => elapsed,
    everyMs: 5 * 60_000,
    checkMs: 5,
    editGapMs: 60_000,
  });

describe("createEventBackups", () => {
  test("takes one at start, on the SSD and on the SD card", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();
    await eventBackups.stop();

    const name = "event-00000001-2026-10-31T19-00-00-000Z-start.sqlite";
    expect(await files(ssd())).toEqual([name]);
    expect(await files(sd())).toEqual([name]);
  });

  test("takes one every 5 minutes, only when something changed", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();

    // Changed, but too soon.
    draw();
    advance(60_000);
    await settle();
    expect(await files()).toHaveLength(1);

    advance(4 * 60_000);
    await settle();
    expect((await files()).at(-1)).toBe(
      "event-00000002-2026-10-31T19-05-00-000Z-interval.sqlite",
    );

    // Nothing changed since.
    advance(10 * 60_000);
    await settle();
    await eventBackups.stop();
    expect(await files()).toHaveLength(2);
  });

  test("keeps going when the booth's clock is set back", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();

    draw();
    wallClock -= 60 * 60_000;
    elapsed += 5 * 60_000;
    await settle();
    await eventBackups.stop();

    expect((await files()).at(-1)).toBe(
      "event-00000002-2026-10-31T18-00-00-000Z-interval.sqlite",
    );
  });

  test("waits for the print to end", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();

    draw();
    busy = true;
    advance(5 * 60_000);
    await settle();
    expect(await files()).toHaveLength(1);

    busy = false;
    await settle();
    await eventBackups.stop();
    expect(await files()).toHaveLength(2);
  });

  test("takes one before an edit, at most once a minute", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();

    // Nothing changed since the start.
    advance(2 * 60_000);
    await eventBackups.beforeEdit();
    expect(await files()).toHaveLength(1);

    draw();
    await eventBackups.beforeEdit();
    expect((await files()).at(-1)).toEndWith("-edit.sqlite");

    // The edit itself, then the next one right after.
    draw();
    advance(10_000);
    await eventBackups.beforeEdit();
    await eventBackups.stop();
    expect((await files()).map((name) => name.split("-").at(-1))).toEqual([
      "start.sqlite",
      "edit.sqlite",
      "stop.sqlite",
    ]);
  });

  test("takes a last one at stop when something changed", async () => {
    const eventBackups = createUnderTest();
    eventBackups.start();
    await settle();

    draw();
    advance(60_000);
    await eventBackups.stop();

    const last = (await files()).at(-1)!;
    expect(last).toBe("event-00000002-2026-10-31T19-01-00-000Z-stop.sqlite");
    const copy = new Database(join(ssd(), last), { readonly: true });
    expect(copy.query("SELECT id FROM draw").all()).toEqual([{ id: "a" }]);
    copy.close();
  });

  test("keeps the SD card copy when the SSD fails, and logs it", async () => {
    // A file where the SSD folder should be.
    const eventBackups = createUnderTest({ dir: join(root, "live.sqlite") });
    eventBackups.start();
    await settle();
    await eventBackups.stop();

    expect(logged).toContainEqual({
      level: "warn",
      event: "event-backup-failed",
    });
    expect(await files(sd())).toHaveLength(1);
  });
});

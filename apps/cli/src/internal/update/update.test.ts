import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { UpdateHost } from "./update";
import type { HealthReading } from "./update.health";
import type { UpdateLayout } from "./update.layout";

import { UpdateRefused, runRecover, runRollback, runUpdate } from "./update";
import {
  bundleAssetName,
  cliAssetName,
  releaseAssetUrl,
} from "./update.release";
import { readHistory, readStatus } from "./update.status";

const PM2_ONLINE = (startedAt: number) =>
  JSON.stringify(
    ["dither-booth-engine", "dither-booth-admin", "dither-booth-shutter"].map(
      (name) => ({ name, pm2_env: { status: "online", pm_uptime: startedAt } }),
    ),
  );

let root: string;
let layout: UpdateLayout;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "booth-update-")));
  layout = {
    repoLink: join(root, "opt/dither-booth"),
    releasesDir: join(root, "opt/dither-booth-releases"),
    sharedDir: join(root, "opt/dither-booth-shared"),
    cacheDir: join(root, "cache"),
    stateDir: join(root, "state"),
    dataDir: join(root, "ssd/data"),
    backupsDir: join(root, "ssd/backups"),
  };
  mkdirSync(join(root, "opt"), { recursive: true });
  mkdirSync(layout.dataDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const dbPath = () => join(layout.dataDir, "dither-booth.sqlite");

function createDatabase() {
  const db = new Database(dbPath());
  db.run(
    "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT)",
  );
  db.run("INSERT INTO __drizzle_migrations (hash) VALUES ('one')");
  db.run("CREATE TABLE visit (id INTEGER PRIMARY KEY)");
  db.close();
}

/** What a new release does to the database when it starts. */
function migrateAndVisit() {
  const db = new Database(dbPath());
  db.run("INSERT INTO __drizzle_migrations (hash) VALUES ('two')");
  db.run("INSERT INTO visit DEFAULT VALUES");
  db.close();
}

const visits = () => {
  const db = new Database(dbPath(), { readonly: true });
  const count = db
    .query<{ n: number }, []>("SELECT count(*) AS n FROM visit")
    .get()?.n;
  db.close();
  return count;
};

/** Today's booth: a checkout with its own logs and .local, data on the SSD. */
function createCheckout(release = "0.7.2-2-g806eca4") {
  const dir = layout.repoLink;
  mkdirSync(join(dir, "logs/pm2"), { recursive: true });
  writeFileSync(join(dir, "logs/pm2/dither-booth-engine.log"), "old line\n");
  mkdirSync(join(dir, ".local/tls"), { recursive: true });
  writeFileSync(join(dir, ".local/tls/booth-cert.pem"), "cert");
  mkdirSync(join(dir, "apps/engine"), { recursive: true });
  symlinkSync(layout.dataDir, join(dir, "apps/engine/data"));
  writeFileSync(join(dir, "DESCRIBE"), release);
}

async function sha256(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/**
 * A booth and GitHub, in memory. `health` decides what each probe sees
 * from the release the repo link points at.
 */
/** This test process, as the job file and the lock would name it. */
const ME = { pid: process.pid, bootId: "boot-a", startedTicks: 100 };
/** A process that ran before and is gone: same pid, an earlier start. */
const GONE = { pid: process.pid, bootId: "boot-a", startedTicks: 1 };
/** Another process, alive now: another pid, started when ME did. */
const OTHER = { pid: process.pid + 1, bootId: "boot-a", startedTicks: 100 };

async function createHost({
  versions = ["0.8.0"],
  health = () => true,
  corruptBundle = false,
  newCli = false,
  onStart,
  busy = [],
}: {
  versions?: string[];
  health?: (release: string) => boolean;
  corruptBundle?: boolean;
  newCli?: boolean;
  onStart?: (release: string) => void;
  /** What `isBusy` answers, one per call, then free. */
  busy?: Array<string | null>;
} = {}) {
  let clock = Date.parse("2026-10-29T10:00:00.000Z");
  const assets = new Map<string, Uint8Array>();

  for (const version of versions) {
    const bundle = new TextEncoder().encode(`bundle ${version}`);
    const cli = new TextEncoder().encode(`cli ${version}`);
    const sums = [
      `${await sha256(bundle)}  ${bundleAssetName(version, "arm64")}`,
      `${await sha256(cli)}  ${cliAssetName("arm64")}`,
    ].join("\n");
    assets.set(
      releaseAssetUrl(version, bundleAssetName(version, "arm64")),
      corruptBundle ? new TextEncoder().encode("truncated") : bundle,
    );
    assets.set(releaseAssetUrl(version, cliAssetName("arm64")), cli);
    assets.set(
      releaseAssetUrl(version, "SHA256SUMS"),
      new TextEncoder().encode(sums),
    );
  }

  const calls: string[] = [];
  const running = () => {
    const target = readlinkSync(layout.repoLink);
    return host.releaseOf(target);
  };
  let startedAt = clock;
  const start = () => {
    startedAt = clock;
    onStart?.(running());
  };

  const host: UpdateHost = {
    processIdentity: () => ME,
    // Alive: this boot, and started when ME did (GONE started earlier).
    isProcessAlive: (identity) =>
      identity.bootId === ME.bootId &&
      identity.startedTicks === ME.startedTicks,
    isBusy: async () => busy.shift() ?? null,
    now: () => new Date(clock),
    fetch: (async (input: string | URL | Request) => {
      const body = assets.get(String(input));
      return body
        ? new Response(body)
        : new Response("not found", { status: 404 });
    }) as typeof fetch,
    sleep: async (ms) => {
      clock += ms;
    },
    arch: "arm64",
    freeBytes: async () => 50 * 1024 ** 3,
    releaseOf: (dir) => {
      const manifest = join(dir, "release.json");
      try {
        return JSON.parse(readFileSync(manifest, "utf8")).version;
      } catch {
        return readFileSync(join(dir, "DESCRIBE"), "utf8");
      }
    },
    unpack: async (bundle, dir) => {
      const version = readFileSync(bundle, "utf8").replace("bundle ", "");
      mkdirSync(join(dir, "apps/engine"), { recursive: true });
      writeFileSync(join(dir, "release.json"), JSON.stringify({ version }));
    },
    chownToServiceUser: async () => {},
    setupSystem: async () => {
      calls.push("setup");
    },
    restartBooth: async () => {
      calls.push(`restart ${running()}`);
      start();
    },
    stopBooth: async () => {
      calls.push("stop");
    },
    startBooth: async () => {
      calls.push(`start ${running()}`);
      start();
    },
    probeHealth: async (): Promise<HealthReading> => {
      clock += 1_000;
      const ok = health(running());
      return {
        pm2: ok ? PM2_ONLINE(startedAt) : "[]",
        engineHealthy: ok,
        now: clock,
      };
    },
    installCli: async () => newCli,
    runInstalledCli: async (args) => {
      calls.push(`cli ${args.join(" ")}`);
      return 0;
    },
    log: () => {},
  };

  return { host, calls };
}

const linkTarget = () => readlinkSync(layout.repoLink);

describe("booth update", () => {
  test("turns today's checkout into a release, keeps it to go back to, and switches", async () => {
    createCheckout();
    createDatabase();
    const { host, calls } = await createHost();

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      kind: "finished",
      job: {
        state: "done",
        from: "0.7.2-2-g806eca4",
        to: "0.8.0",
        migrated: false,
      },
    });
    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
    expect(readdirSync(layout.releasesDir).toSorted()).toEqual([
      "0.8.0",
      "legacy-0.7.2-2-g806eca4",
    ]);

    // What the checkout wrote moved to shared, linked from both releases.
    for (const release of ["0.8.0", "legacy-0.7.2-2-g806eca4"]) {
      const dir = join(layout.releasesDir, release);
      expect(readlinkSync(join(dir, "logs"))).toBe(
        join(layout.sharedDir, "logs"),
      );
      expect(readlinkSync(join(dir, ".local"))).toBe(
        join(layout.sharedDir, ".local"),
      );
      expect(readlinkSync(join(dir, "apps/engine/data"))).toBe(layout.dataDir);
    }
    expect(
      readFileSync(
        join(layout.sharedDir, "logs/pm2/dither-booth-engine.log"),
        "utf8",
      ),
    ).toBe("old line\n");

    expect(calls).toEqual(["setup", "restart 0.8.0"]);
    expect(readdirSync(layout.backupsDir)).toHaveLength(1);
    expect((await readHistory(layout.stateDir))[0]?.state).toBe("done");
  });

  test("goes back, database included, when the new release doesn't start", async () => {
    createCheckout();
    createDatabase();
    const { host, calls } = await createHost({
      health: (release) => release !== "0.8.0",
      onStart: (release) => {
        if (release === "0.8.0") migrateAndVisit();
      },
    });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      kind: "finished",
      job: { state: "rolled-back", migrated: true },
    });
    expect(outcome.kind === "finished" && outcome.job.error).toContain(
      "v0.8.0 didn't start",
    );
    expect(linkTarget()).toBe(
      join(layout.releasesDir, "legacy-0.7.2-2-g806eca4"),
    );
    expect(visits()).toBe(0);
    expect(calls).toEqual([
      "setup",
      "restart 0.8.0",
      "stop",
      "start 0.7.2-2-g806eca4",
    ]);
  });

  test("changes nothing when the download doesn't match its SHA256SUMS", async () => {
    createCheckout();
    const { host, calls } = await createHost({ corruptBundle: true });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      job: { state: "failed", step: "download" },
    });
    expect(lstatSync(layout.repoLink).isDirectory()).toBe(true);
    expect(calls).toEqual([]);
    expect(readdirSync(layout.cacheDir)).not.toContain(
      bundleAssetName("0.8.0", "arm64"),
    );
  });

  test("refuses a release that doesn't exist, with the booth untouched", async () => {
    createCheckout();
    const { host } = await createHost();

    const outcome = await runUpdate({ layout, host, version: "9.9.9" });

    expect(outcome).toMatchObject({
      job: { state: "failed", step: "preflight" },
    });
    expect(outcome.kind === "finished" && outcome.job.error).toContain(
      "No release v9.9.9",
    );
  });

  test("hands the job to the release's own CLI when it's a new one", async () => {
    createCheckout();
    const { host, calls } = await createHost({ newCli: true });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });
    const status = await readStatus(layout.stateDir);

    expect(outcome).toEqual({ kind: "handed-over", exitCode: 0 });
    expect(calls).toEqual([`cli update 0.8.0 --resume ${status?.jobId}`]);
  });

  test("does nothing on the release it already runs, and keeps only two releases", async () => {
    createCheckout();
    const { host } = await createHost({ versions: ["0.8.0", "0.9.0"] });

    await runUpdate({ layout, host, version: "0.8.0" });
    await runUpdate({ layout, host, version: "0.9.0" });

    expect(await runUpdate({ layout, host, version: "0.9.0" })).toEqual({
      kind: "up-to-date",
      version: "0.9.0",
    });
    expect(readdirSync(layout.releasesDir).toSorted()).toEqual([
      "0.8.0",
      "0.9.0",
    ]);
  });

  test("refuses to run while another update holds the lock, not after it died", async () => {
    createCheckout();
    mkdirSync(layout.stateDir, { recursive: true });
    const { host } = await createHost();

    writeFileSync(join(layout.stateDir, "lock"), JSON.stringify(ME));
    expect(
      runUpdate({ layout, host, version: "0.8.0" }),
    ).rejects.toBeInstanceOf(UpdateRefused);

    // The same pid, started earlier: a process that is gone.
    writeFileSync(join(layout.stateDir, "lock"), JSON.stringify(GONE));
    expect((await runUpdate({ layout, host, version: "0.8.0" })).kind).toBe(
      "finished",
    );
  });

  test("waits at the switch while a guest or a print keeps the booth busy", async () => {
    createCheckout();
    const { host, calls } = await createHost({
      busy: ["A ticket is printing.", "A guest is in a visit.", null],
    });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({ job: { state: "done" } });
    expect(calls).toEqual(["setup", "restart 0.8.0"]);
  });

  test("gives up on a booth that stays busy, with nothing changed", async () => {
    createCheckout();
    const { host, calls } = await createHost({
      busy: Array.from({ length: 60 }, () => "A guest is in a visit."),
    });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      job: { state: "failed", error: expect.stringContaining("stayed busy") },
    });
    expect(lstatSync(layout.repoLink).isDirectory()).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("booth rollback", () => {
  async function updatedBooth({ migrate }: { migrate: boolean }) {
    createCheckout();
    createDatabase();
    const booth = await createHost({
      onStart: (release) => {
        if (migrate && release === "0.8.0") migrateAndVisit();
      },
    });
    await runUpdate({ layout, host: booth.host, version: "0.8.0" });
    booth.calls.length = 0;
    return booth;
  }

  test("goes back to the release before the update", async () => {
    const { host, calls } = await updatedBooth({ migrate: false });

    const outcome = await runRollback({ layout, host, mode: "keep-db" });

    expect(outcome).toMatchObject({
      job: {
        kind: "rollback",
        state: "done",
        from: "0.8.0",
        to: "0.7.2-2-g806eca4",
      },
    });
    expect(linkTarget()).toBe(
      join(layout.releasesDir, "legacy-0.7.2-2-g806eca4"),
    );
    expect(calls).toEqual(["stop", "start 0.7.2-2-g806eca4"]);
  });

  test("refuses to keep a database the newer release migrated", async () => {
    const { host } = await updatedBooth({ migrate: true });

    expect(runRollback({ layout, host, mode: "keep-db" })).rejects.toThrow(
      "--restore-db",
    );
    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
  });

  test("restores the backup when asked, losing what came after", async () => {
    const { host } = await updatedBooth({ migrate: true });
    expect(visits()).toBe(1);

    const outcome = await runRollback({ layout, host, mode: "restore-db" });

    expect(outcome).toMatchObject({ job: { state: "done" } });
    expect(visits()).toBe(0);
  });
});

describe("an interrupted job", () => {
  /** What a job whose process died leaves: running, with a dead pid. */
  async function interruptedAt(step: string, switched: boolean) {
    createCheckout();
    createDatabase();
    const booth = await createHost();
    // A first update makes the checkout a release to go back to.
    await runUpdate({ layout, host: booth.host, version: "0.8.0" });
    const second = await createHost({ versions: ["0.9.0"] });
    second.host.runInstalledCli = async () => 0;
    const status = JSON.parse(
      readFileSync(join(layout.stateDir, "status.json"), "utf8"),
    );
    if (switched) {
      mkdirSync(join(layout.releasesDir, "0.9.0/apps/engine"), {
        recursive: true,
      });
      writeFileSync(
        join(layout.releasesDir, "0.9.0/release.json"),
        JSON.stringify({ version: "0.9.0" }),
      );
      symlinkSync(
        layout.dataDir,
        join(layout.releasesDir, "0.9.0/apps/engine/data"),
      );
      rmSync(layout.repoLink);
      symlinkSync(join(layout.releasesDir, "0.9.0"), layout.repoLink);
    }
    writeFileSync(
      join(layout.stateDir, "status.json"),
      JSON.stringify({
        ...status,
        jobId: "interrupted",
        from: "0.8.0",
        to: "0.9.0",
        state: "running",
        step,
        backup: null,
        migrationsBefore: 1,
        migrated: null,
        process: GONE,
      }),
    );
    return second;
  }

  test("after its switch, goes back to the release before", async () => {
    const { host, calls } = await interruptedAt("check", true);

    const job = await runRecover({ layout, host, restart: true });

    expect(job).toMatchObject({
      state: "rolled-back",
      error: "Interrupted during check.",
      migrated: false,
    });
    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
    expect(calls).toEqual(["stop", "start 0.8.0"]);
  });

  test("before its switch, changed nothing and says so", async () => {
    const { host, calls } = await interruptedAt("download", false);

    const job = await runRecover({ layout, host, restart: true });

    expect(job).toMatchObject({
      state: "failed",
      error: "Interrupted during download. Nothing changed.",
    });
    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
    expect(calls).toEqual([]);
  });

  test("cut short while going back, finishes going back", async () => {
    const { host, calls } = await interruptedAt("rollback", true);

    const job = await runRecover({ layout, host, restart: true });

    expect(job).toMatchObject({ state: "rolled-back" });
    expect(job?.error).not.toContain("Nothing changed");
    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
    expect(calls).toEqual(["stop", "start 0.8.0"]);
  });

  test("at the booth's start, moves the link back without restarting it", async () => {
    const { host, calls } = await interruptedAt("restart", true);

    await runRecover({ layout, host, restart: false });

    expect(linkTarget()).toBe(join(layout.releasesDir, "0.8.0"));
    expect(calls).toEqual([]);
  });

  test("leaves a job whose process still runs alone", async () => {
    const { host } = await interruptedAt("download", false);
    const path = join(layout.stateDir, "status.json");
    writeFileSync(
      path,
      JSON.stringify({
        ...JSON.parse(readFileSync(path, "utf8")),
        process: OTHER,
      }),
    );

    expect(await runRecover({ layout, host, restart: true })).toBeNull();
    expect((await readStatus(layout.stateDir))?.state).toBe("running");
  });
});

describe("refusals", () => {
  test("are failed jobs the admin and the Hub can read", async () => {
    createCheckout();
    const { host } = await createHost();
    host.arch = "x64";

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      job: { state: "failed", error: "Releases are built for arm64 only." },
    });
    expect((await readStatus(layout.stateDir))?.state).toBe("failed");
  });

  test("including no answer from GitHub for the latest release", async () => {
    createCheckout();
    const { host } = await createHost();

    const outcome = await runUpdate({ layout, host });

    expect(outcome).toMatchObject({
      job: { state: "failed", to: "latest" },
    });
  });
});

describe("going back after a failed check", () => {
  test("keeps the database when the new release migrated nothing", async () => {
    createCheckout();
    createDatabase();
    const { host } = await createHost({
      health: (release) => release !== "0.8.0",
      onStart: (release) => {
        if (release === "0.8.0") {
          const db = new Database(dbPath());
          db.run("INSERT INTO visit DEFAULT VALUES");
          db.close();
        }
      },
    });

    const outcome = await runUpdate({ layout, host, version: "0.8.0" });

    expect(outcome).toMatchObject({
      job: { state: "rolled-back", migrated: false },
    });
    expect(visits()).toBe(1);
  });
});

describe("the rollback target", () => {
  test("is written for the admin after each job, and never the running release", async () => {
    createCheckout();
    const { host } = await createHost();
    const target = () =>
      JSON.parse(readFileSync(join(layout.stateDir, "rollback.json"), "utf8"));

    await runUpdate({ layout, host, version: "0.8.0" });

    expect(target()).toMatchObject({
      release: "0.7.2-2-g806eca4",
      migrated: false,
    });

    await runRollback({ layout, host, mode: "keep-db" });

    expect(target()).toBeNull();
  });
});

import {
  BOOTH_UPDATE_MIN_FREE_BYTES,
  type BoothRollbackMode,
  type BoothRollbackTarget,
  type BoothUpdateJob,
  type ProcessIdentity,
  fetchLatestRelease,
  isReleaseVersion,
  processIdentitySchema,
} from "@dither-booth/shared/booth-update";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { SupportedArch } from "#internal/system";

import { ENGINE_DB_FILE, RELEASES_REPO } from "#internal/config";

import type { HealthReading, HealthVerdict } from "./update.health";
import type { UpdateLayout } from "./update.layout";

import {
  backupDatabaseFile,
  countMigrations,
  restoreDatabase,
} from "./update.db";
import { assessBoothHealth } from "./update.health";
import {
  LEGACY_RELEASE_PREFIX,
  SHARED_PATHS,
  engineDataPath,
  planPrune,
  readRepoState,
  releaseDirCandidates,
  releaseDirFor,
} from "./update.layout";
import {
  SHA256SUMS_ASSET,
  bundleAssetName,
  cliAssetName,
  parseSha256Sums,
  releaseAssetUrl,
  sha256File,
} from "./update.release";
import {
  type JobRecorder,
  createJobRecorder,
  readHistory,
  readStatus,
  writeRollbackTarget,
} from "./update.status";

/*
 * `booth update` and `booth rollback`, behind the machine they act on.
 * The booth keeps running the old release through every step up to the
 * switch; from the switch on, any failure goes back to it.
 */

/** Room the download and the unpacked release need, with margin. */
export const MIN_FREE_BYTES = BOOTH_UPDATE_MIN_FREE_BYTES;
/** How long a new release gets to come up before it's rolled back. */
export const CHECK_TIMEOUT_MS = 120_000;
const CHECK_INTERVAL_MS = 3_000;
/** How long the switch waits for a busy booth (a print, a visit) to free up. */
const BUSY_WAIT_MS = 10 * 60_000;
const BUSY_POLL_MS = 15_000;

export type UpdateHost = {
  now: () => Date;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  arch: SupportedArch | undefined;
  freeBytes: (path: string) => Promise<number>;
  /** The release a folder holds: its release.json, or git describe. */
  releaseOf: (dir: string) => string;
  /** Unpacks the bundle into `dir`, as the service user. */
  unpack: (bundle: string, dir: string) => Promise<void>;
  chownToServiceUser: (path: string) => Promise<void>;
  /** What this CLI installs: units, polkit rules, the network setup. */
  setupSystem: () => Promise<void>;
  restartBooth: () => Promise<void>;
  stopBooth: () => Promise<void>;
  startBooth: () => Promise<void>;
  probeHealth: (repoLink: string) => Promise<HealthReading>;
  /** This process, as the job file and the lock name it; null off Linux. */
  processIdentity: () => ProcessIdentity | null;
  /** Whether the process an identity names still runs. */
  isProcessAlive: (identity: ProcessIdentity) => boolean;
  /**
   * Whether the booth may restart now (a ticket printing, a visit under
   * way); null when there is no one to ask (the engine is down).
   */
  isBusy: () => Promise<string | null>;
  /** Installs a downloaded CLI binary; true when it differs from this one. */
  installCli: (binary: string) => Promise<boolean>;
  /** Runs the installed CLI with `args` to its end; its exit code. */
  runInstalledCli: (args: string[]) => Promise<number>;
  log: (message: string) => void;
};

export type JobOutcome =
  | { kind: "up-to-date"; version: string }
  | { kind: "handed-over"; exitCode: number }
  | { kind: "finished"; job: BoothUpdateJob };

export class UpdateRefused extends Error {}

// ---- the lock ----------------------------------------------------------------

/**
 * One job at a time: a file naming the process that runs it, by its full
 * identity (pid, boot, start time), so a pid handed to another process
 * after a crash or a reboot never holds the lock. The CLI that hands a
 * job over keeps it until the new CLI ends.
 */
async function takeLock(
  stateDir: string,
  host: UpdateHost,
): Promise<() => Promise<void>> {
  const me = host.processIdentity();
  await mkdir(stateDir, { recursive: true, mode: 0o755 });
  const path = join(stateDir, "lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(JSON.stringify(me));
      await handle.close();
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const holder = processIdentitySchema
        .nullable()
        .safeParse(
          JSON.parse(await readFile(path, "utf8").catch(() => "null")),
        );
      if (holder.success && holder.data && host.isProcessAlive(holder.data)) {
        throw new UpdateRefused(
          `Another update or rollback runs (pid ${holder.data.pid}).`,
        );
      }
      // Its process is gone: the lock is stale.
      await rm(path, { force: true });
    }
  }

  throw new UpdateRefused("Couldn't take the update lock.");
}

/**
 * Every job's frame: the lock, a job a crash left behind ended first,
 * the work, then where a rollback goes written for the admin.
 */
export async function withLock<T>(
  layout: UpdateLayout,
  host: UpdateHost,
  work: () => Promise<T>,
): Promise<T> {
  const unlock = await takeLock(layout.stateDir, host);

  try {
    return await work();
  } finally {
    await publishRollbackTarget(layout, host).catch(() => {});
    await unlock();
  }
}

// ---- folders -----------------------------------------------------------------

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

/** A half-unpacked release folder, left by a job that didn't get to rename it. */
const removeStaging = (layout: UpdateLayout, version: string) =>
  rm(`${releaseDirFor(layout, version)}.tmp`, { recursive: true, force: true });

/** Moves `/opt/dither-booth` to `target`, in one rename. */
async function pointRepoAt(layout: UpdateLayout, target: string) {
  const next = `${layout.repoLink}.next`;
  await rm(next, { force: true });
  await symlink(target, next);
  await rename(next, layout.repoLink);
}

/** Where a release's `apps/engine/data` should point, as the running one's does. */
async function resolveDataTarget(
  layout: UpdateLayout,
  runningDir: string | null,
): Promise<string> {
  if (!runningDir) return layout.dataDir;

  const path = engineDataPath(runningDir);
  const stats = await lstat(path).catch(() => undefined);

  if (stats?.isSymbolicLink()) {
    return resolve(dirname(path), await readlink(path));
  }

  // A checkout that kept its data on the SD card: it moves to shared.
  return stats ? join(layout.sharedDir, "engine-data") : layout.dataDir;
}

/** Links what outlives a release into `dir`. */
async function linkShared(
  layout: UpdateLayout,
  host: UpdateHost,
  dir: string,
  dataTarget: string,
) {
  await mkdir(layout.sharedDir, { recursive: true });

  for (const path of SHARED_PATHS) {
    const shared = join(layout.sharedDir, path);
    await mkdir(shared, { recursive: true });
    await host.chownToServiceUser(shared);
    await rm(join(dir, path), { recursive: true, force: true });
    await symlink(shared, join(dir, path));
  }

  const data = engineDataPath(dir);
  await mkdir(dirname(data), { recursive: true });
  await rm(data, { recursive: true, force: true });
  await symlink(dataTarget, data);
}

/**
 * A checkout from before releases keeps what it writes at runtime in its
 * own folder. That moves to shared and is linked back, before the new
 * release links to it. Same filesystem: open files (PM2's logs) keep
 * writing through. Safe to run again: links are left alone.
 */
async function shareFromCheckout(
  layout: UpdateLayout,
  host: UpdateHost,
  checkout: string,
  dataTarget: string,
): Promise<void> {
  await mkdir(layout.sharedDir, { recursive: true });

  for (const path of SHARED_PATHS) {
    const own = join(checkout, path);
    const shared = join(layout.sharedDir, path);
    const stats = await lstat(own).catch(() => undefined);

    if (stats?.isSymbolicLink()) continue;

    if (stats) {
      if (await exists(shared)) {
        // Both hold something: keep both, the checkout's to one side.
        await rename(own, `${own}.pre-release`);
      } else {
        await rename(own, shared);
      }
    }

    await mkdir(shared, { recursive: true });
    await host.chownToServiceUser(shared);
    await symlink(shared, own);
  }

  const data = engineDataPath(checkout);
  const dataStats = await lstat(data).catch(() => undefined);

  if (dataStats && !dataStats.isSymbolicLink()) {
    await rename(data, dataTarget);
    await symlink(dataTarget, data);
  }
}

/** Moves the checkout into the releases folder, so a rollback can return to it. */
async function moveCheckout(
  layout: UpdateLayout,
  checkout: string,
  release: string,
): Promise<string> {
  const dest = join(layout.releasesDir, `${LEGACY_RELEASE_PREFIX}${release}`);
  await rm(dest, { recursive: true, force: true });
  await rename(checkout, dest);
  return dest;
}

async function prune(layout: UpdateLayout, keep: string[], bundle: string) {
  const folders = await readdir(layout.releasesDir).catch(() => []);

  for (const name of planPrune(folders, keep)) {
    await rm(join(layout.releasesDir, name), { recursive: true, force: true });
  }

  for (const name of await readdir(layout.cacheDir).catch(() => [])) {
    if (name !== bundle) {
      await rm(join(layout.cacheDir, name), { recursive: true, force: true });
    }
  }
}

// ---- downloads ---------------------------------------------------------------

async function download(host: UpdateHost, url: string, dest: string) {
  const response = await host.fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  await mkdir(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  await Bun.write(part, response);
  await rename(part, dest);
}

async function verified(path: string, sums: Map<string, string>, name: string) {
  const expected = sums.get(name);

  if (!expected) throw new Error(`SHA256SUMS doesn't list ${name}.`);

  return (await sha256File(path)) === expected;
}

/** Downloads a release asset into the cache, unless a verified copy is there. */
async function fetchAsset(
  host: UpdateHost,
  layout: UpdateLayout,
  version: string,
  name: string,
  sums: Map<string, string>,
): Promise<string> {
  const dest = join(layout.cacheDir, name);

  if ((await exists(dest)) && (await verified(dest, sums, name))) return dest;

  await download(host, releaseAssetUrl(version, name), dest);

  if (!(await verified(dest, sums, name))) {
    await rm(dest, { force: true });
    throw new Error(`${name} doesn't match its SHA256SUMS: download it again.`);
  }

  return dest;
}

async function fetchSums(host: UpdateHost, version: string) {
  const response = await host.fetch(releaseAssetUrl(version, SHA256SUMS_ASSET));

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? `No release v${version} (or it has no SHA256SUMS).`
        : `GitHub answered ${response.status} for v${version}.`,
    );
  }

  return parseSha256Sums(await response.text());
}

// ---- checking ----------------------------------------------------------------

export async function waitHealthy(
  host: UpdateHost,
  layout: UpdateLayout,
): Promise<HealthVerdict> {
  const deadline = host.now().getTime() + CHECK_TIMEOUT_MS;
  let verdict: HealthVerdict = { ok: false, reason: "not checked" };

  while (host.now().getTime() < deadline) {
    verdict = assessBoothHealth(await host.probeHealth(layout.repoLink));
    if (verdict.ok) return verdict;
    await host.sleep(CHECK_INTERVAL_MS);
  }

  return verdict;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// ---- jobs ------------------------------------------------------------------

const newJobId = (now: Date) => now.toISOString().replaceAll(/[:.]/gu, "-");

function newJob(
  host: UpdateHost,
  fields: Pick<BoothUpdateJob, "kind" | "from" | "to" | "step">,
): BoothUpdateJob {
  const startedAt = host.now().toISOString();
  return {
    ...fields,
    jobId: newJobId(host.now()),
    state: "running",
    startedAt,
    updatedAt: startedAt,
    error: null,
    backup: null,
    migrationsBefore: null,
    migrated: null,
    process: host.processIdentity(),
  };
}

/** The folder a recorded release is in, while it's still on the booth. */
async function findReleaseDir(
  layout: UpdateLayout,
  release: string | null,
): Promise<string | null> {
  for (const candidate of release
    ? releaseDirCandidates(layout, release)
    : []) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Where `booth rollback` would go now: the release the last update to
 * the running one came from, while its folder is still on the booth.
 * Written to rollback.json after every job, so the admin offers exactly
 * what the CLI would do.
 */
export async function findRollbackTarget(
  layout: UpdateLayout,
  host: UpdateHost,
): Promise<(NonNullable<BoothRollbackTarget> & { dir: string }) | null> {
  const repo = await readRepoState(layout);
  if (repo.kind !== "release") return null;

  const current = host.releaseOf(repo.dir);
  const installed = (await readHistory(layout.stateDir)).find(
    (job) =>
      job.kind === "update" &&
      job.state === "done" &&
      job.to === current &&
      job.from !== current,
  );
  const dir = await findReleaseDir(layout, installed?.from ?? null);

  if (!installed?.from || !dir) return null;

  return {
    release: installed.from,
    dir,
    migrated: installed.migrated === true,
    backup: installed.backup,
    backupTakenAt: installed.backup ? installed.startedAt : null,
  };
}

async function publishRollbackTarget(layout: UpdateLayout, host: UpdateHost) {
  const target = await findRollbackTarget(layout, host);
  await writeRollbackTarget(
    layout.stateDir,
    target
      ? {
          release: target.release,
          migrated: target.migrated,
          backup: target.backup,
          backupTakenAt: target.backupTakenAt,
        }
      : null,
  );
}

/** The database the running release uses, through its data link. */
const databaseOf = (releaseDir: string) =>
  realpath(join(engineDataPath(releaseDir), ENGINE_DB_FILE)).catch(() => null);

/**
 * Whether the release that ran since `job`'s backup changed the database:
 * migrations are counted again now, against the count before the switch.
 */
function migratedSince(job: BoothUpdateJob, dbPath: string | null): boolean {
  if (!dbPath || job.migrationsBefore === null) return false;
  const now = countMigrations(dbPath);
  return now !== null && now !== job.migrationsBefore;
}

/**
 * Goes back to `previousDir` after the switch: stops the booth, puts the
 * backup back only when the newer release migrated, moves the link,
 * starts and checks. `restart: false` at boot, inside the booth's own
 * start, which starts it afterwards anyway.
 */
async function switchBack({
  layout,
  host,
  recorder,
  previousDir,
  reason,
  restart,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  recorder: JobRecorder;
  previousDir: string;
  reason: string;
  restart: boolean;
}): Promise<void> {
  const { job } = recorder;
  host.log(`${reason} Going back to ${job.from}.`);
  await recorder.update({ step: "rollback", error: reason });

  try {
    if (restart) await host.stopBooth();

    const repo = await readRepoState(layout);
    const dbPath = repo.kind === "release" ? await databaseOf(repo.dir) : null;
    const migrated = migratedSince(job, dbPath);

    if (dbPath && job.backup && migrated) {
      await restoreDatabase(job.backup, dbPath);
      await host.chownToServiceUser(dbPath);
    }

    await pointRepoAt(layout, previousDir);
    await recorder.update({ migrated });

    if (!restart) {
      await recorder.finish({ state: "rolled-back", error: reason });
      return;
    }

    await host.startBooth();
    const again = await waitHealthy(host, layout);
    await recorder.finish({
      state: "rolled-back",
      error: again.ok
        ? reason
        : `${reason} ${job.from} didn't start again either: ${again.reason}.`,
    });
  } catch (error) {
    await recorder.finish({
      state: "rolled-back",
      error: `${reason} Going back failed too: ${errorMessage(error)}`,
    });
  }
}

// ---- update ------------------------------------------------------------------

export async function runUpdate({
  layout,
  host,
  version: requested,
  resumeJobId,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  /** Omitted: the latest release. */
  version?: string;
  /** Set by the CLI that installed this one and handed the job over. */
  resumeJobId?: string;
}): Promise<JobOutcome> {
  // The CLI that handed over holds the lock until this one ends.
  if (resumeJobId) return update({ layout, host, requested, resumeJobId });

  return withLock(layout, host, async () => {
    await recover({ layout, host, restart: true });
    return update({ layout, host, requested, resumeJobId });
  });
}

async function update({
  layout,
  host,
  requested,
  resumeJobId,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  requested: string | undefined;
  resumeJobId: string | undefined;
}): Promise<JobOutcome> {
  const repo = await readRepoState(layout);
  const runningDir = repo.kind === "missing" ? null : repo.dir;
  const from = runningDir ? host.releaseOf(runningDir) : null;

  // "Latest" is resolved first, so a booth already on it records no job.
  // A failure to resolve it is recorded as a failed job below.
  let latestError: unknown = null;
  const version =
    requested ??
    (await fetchLatestRelease({ fetch: host.fetch, repo: RELEASES_REPO }).then(
      (latest) => latest.version,
      (error: unknown) => {
        latestError = error;
        return null;
      },
    ));

  if (version !== null && version === from && repo.kind === "release") {
    return { kind: "up-to-date", version };
  }

  const resumed = resumeJobId ? await readStatus(layout.stateDir) : null;
  const recorder = await createJobRecorder({
    stateDir: layout.stateDir,
    now: host.now,
    job:
      resumed && resumed.jobId === resumeJobId
        ? { ...resumed, process: host.processIdentity() }
        : newJob(host, {
            kind: "update",
            from,
            to: version ?? "latest",
            step: "preflight",
          }),
  });
  const say = (message: string) => host.log(message);
  let switched = false;
  let previousDir = runningDir;

  try {
    // Every refusal from here on is a failed job the admin and the Hub
    // can read, not a silent exit.
    if (version === null) throw latestError;
    if (!isReleaseVersion(version)) {
      throw new Error(`Not a release version: ${version}`);
    }
    if (host.arch !== "arm64") {
      throw new Error("Releases are built for arm64 only.");
    }

    const free = await host.freeBytes(dirname(layout.releasesDir));
    if (free < MIN_FREE_BYTES) {
      throw new Error(
        `Only ${Math.floor(free / 1024 ** 2)} MB free: an update needs 1 GB.`,
      );
    }

    const sums = await fetchSums(host, version);

    if (!resumeJobId) {
      await recorder.update({ step: "cli" });
      const cli = await fetchAsset(
        host,
        layout,
        version,
        cliAssetName("arm64"),
        sums,
      );

      if (await host.installCli(cli)) {
        say(`Installed the v${version} CLI; it carries on with the update.`);
        const exitCode = await host.runInstalledCli([
          "update",
          version,
          "--resume",
          recorder.job.jobId,
        ]);
        // The new CLI died before it finished: go back if it switched.
        await recover({ layout, host, restart: true });
        return { kind: "handed-over", exitCode };
      }
    }

    await recorder.update({ step: "download" });
    const bundleName = bundleAssetName(version, "arm64");
    say(`Downloading ${bundleName}`);
    const bundle = await fetchAsset(host, layout, version, bundleName, sums);

    await recorder.update({ step: "unpack" });
    const dataTarget = await resolveDataTarget(layout, runningDir);
    if (repo.kind === "checkout") {
      await shareFromCheckout(layout, host, repo.dir, dataTarget);
    }
    const releaseDir = releaseDirFor(layout, version);
    const staging = `${releaseDir}.tmp`;
    await mkdir(layout.releasesDir, { recursive: true });
    await rm(staging, { recursive: true, force: true });
    await host.unpack(bundle, staging);
    await linkShared(layout, host, staging, dataTarget);
    // A folder of this version left by a failed update isn't running.
    await rm(releaseDir, { recursive: true, force: true });
    await rename(staging, releaseDir);

    await recorder.update({ step: "backup" });
    const dbPath = runningDir ? await databaseOf(runningDir) : null;
    if (dbPath) {
      const backup = await backupDatabaseFile({
        dbPath,
        dir: layout.backupsDir,
        kind: "update",
        label: `${recorder.job.jobId}-${from ?? "none"}-to-${version}`,
      });
      await recorder.update({
        backup,
        migrationsBefore: countMigrations(dbPath),
      });
      say(`Database backed up to ${backup}`);
    }

    await recorder.update({ step: "switch" });
    // The download took minutes: a guest may have come in since the job
    // was found safe to start. Wait for the booth to be free, up to 10 min.
    const busyDeadline = host.now().getTime() + BUSY_WAIT_MS;
    for (;;) {
      const busy = await host.isBusy();
      if (!busy) break;
      if (host.now().getTime() >= busyDeadline) {
        throw new Error(`The booth stayed busy for 10 minutes: ${busy}`);
      }
      say(`${busy} Waiting before the switch.`);
      await host.sleep(BUSY_POLL_MS);
    }
    if (repo.kind === "checkout" && from) {
      previousDir = await moveCheckout(layout, repo.dir, from);
    }
    await pointRepoAt(layout, releaseDir);
    switched = true;

    // After the switch, so its restarts (a new journal group, a changed
    // network watch) fold into the restart below.
    await recorder.update({ step: "setup" });
    await host.setupSystem();

    await recorder.update({ step: "restart" });
    await host.restartBooth();

    await recorder.update({ step: "check" });
    const verdict = await waitHealthy(host, layout);
    await recorder.update({ migrated: migratedSince(recorder.job, dbPath) });

    if (!verdict.ok) {
      throw new Error(`v${version} didn't start: ${verdict.reason}.`);
    }

    await recorder.finish({ state: "done" });
    say(`The booth runs v${version}.`);
    await prune(
      layout,
      [basename(releaseDir), previousDir ? basename(previousDir) : null].filter(
        (name): name is string => name !== null,
      ),
      bundleName,
    );
    return { kind: "finished", job: recorder.job };
  } catch (error) {
    const reason = errorMessage(error);

    if (!switched || !previousDir) {
      await removeStaging(layout, recorder.job.to);
      await recorder.finish({ state: "failed", error: reason });
      return { kind: "finished", job: recorder.job };
    }

    await switchBack({
      layout,
      host,
      recorder,
      previousDir,
      reason,
      restart: true,
    });
    return { kind: "finished", job: recorder.job };
  }
}

// ---- recover -----------------------------------------------------------------

/**
 * Ends a job whose process is gone: a CLI that died after the handover,
 * a unit killed at its timeout, a power cut. Before the switch nothing
 * changed; after it, the booth goes back. Run after the handover, by the
 * update unit's ExecStopPost, at every booth start (`restart: false`),
 * and before each new job. Does nothing while the job's process lives.
 */
export async function recover({
  layout,
  host,
  restart,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  restart: boolean;
}): Promise<BoothUpdateJob | null> {
  const status = await readStatus(layout.stateDir);

  if (!status || status.state !== "running") return null;
  const me = host.processIdentity();
  if (
    status.process !== null &&
    status.process.pid !== me?.pid &&
    host.isProcessAlive(status.process)
  ) {
    return null;
  }

  const recorder = await createJobRecorder({
    stateDir: layout.stateDir,
    now: host.now,
    job: { ...status, process: me },
  });
  const reason = `Interrupted during ${status.step}.`;
  const repo = await readRepoState(layout);
  const switchedTo =
    repo.kind === "release" && host.releaseOf(repo.dir) === status.to;
  const previousDir = await findReleaseDir(layout, status.from);

  if (status.kind === "rollback") {
    // A rollback moves the link last but one: wherever it points runs.
    await recorder.finish({ state: "failed", error: reason });
  } else if (status.step === "rollback" && previousDir) {
    // Going back was itself cut short: the link may point either way.
    await switchBack({
      layout,
      host,
      recorder,
      previousDir,
      reason: status.error ?? reason,
      restart,
    });
  } else if (switchedTo && previousDir) {
    await switchBack({ layout, host, recorder, previousDir, reason, restart });
  } else {
    await removeStaging(layout, status.to);
    await recorder.finish({
      state: "failed",
      error: `${reason} Nothing changed.`,
    });
  }

  host.log(`${status.kind} to ${status.to}: ${recorder.job.error}`);
  return recorder.job;
}

/** `booth update --recover`, for the units: lock, recover, publish. */
export async function runRecover({
  layout,
  host,
  restart,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  restart: boolean;
}): Promise<BoothUpdateJob | null> {
  try {
    return await withLock(layout, host, () =>
      recover({ layout, host, restart }),
    );
  } catch (error) {
    // A live job holds the lock: nothing to recover.
    if (error instanceof UpdateRefused) return null;
    throw error;
  }
}

// ---- rollback ----------------------------------------------------------------

export async function runRollback({
  layout,
  host,
  mode,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  mode: BoothRollbackMode;
}): Promise<JobOutcome> {
  return withLock(layout, host, async () => {
    await recover({ layout, host, restart: true });
    return rollback({ layout, host, mode });
  });
}

async function rollback({
  layout,
  host,
  mode,
}: {
  layout: UpdateLayout;
  host: UpdateHost;
  mode: BoothRollbackMode;
}): Promise<JobOutcome> {
  const repo = await readRepoState(layout);
  const target = await findRollbackTarget(layout, host);

  if (repo.kind !== "release" || !target) {
    throw new UpdateRefused("No earlier release on this booth to go back to.");
  }

  const current = host.releaseOf(repo.dir);

  if (target.migrated && mode === "keep-db") {
    throw new UpdateRefused(
      `v${current} changed the database, so ${target.release} can't run on it. ` +
        "`sudo booth rollback --restore-db` restores the backup taken before " +
        `the update (${target.backupTakenAt}): visits since are lost.`,
    );
  }

  if (mode === "restore-db" && !target.backup) {
    throw new UpdateRefused(`The update to v${current} kept no backup.`);
  }

  const recorder = await createJobRecorder({
    stateDir: layout.stateDir,
    now: host.now,
    job: {
      ...newJob(host, {
        kind: "rollback",
        from: current,
        to: target.release,
        step: "switch",
      }),
      backup: mode === "restore-db" ? target.backup : null,
    },
  });

  try {
    await host.stopBooth();

    if (mode === "restore-db" && target.backup) {
      const dbPath = await databaseOf(repo.dir);
      if (dbPath) {
        await restoreDatabase(target.backup, dbPath);
        await host.chownToServiceUser(dbPath);
      }
    }

    await pointRepoAt(layout, target.dir);
    await recorder.update({ step: "restart" });
    await host.startBooth();
    await recorder.update({ step: "check" });
    const verdict = await waitHealthy(host, layout);

    if (!verdict.ok) {
      throw new Error(`${target.release} didn't start: ${verdict.reason}.`);
    }

    await recorder.finish({ state: "done" });
    host.log(`The booth runs ${target.release} again.`);
  } catch (error) {
    // Back to the release it ran, which was up.
    await host.stopBooth().catch(() => {});
    await pointRepoAt(layout, repo.dir);
    await host.startBooth().catch(() => {});
    await recorder.finish({ state: "failed", error: errorMessage(error) });
  }

  return { kind: "finished", job: recorder.job };
}

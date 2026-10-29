import {
  type BoothRollbackMode,
  type BoothUpdateJob,
  isReleaseVersion,
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

import { ENGINE_DB_FILE } from "#internal/config";

import type { HealthReading, HealthVerdict } from "./update.health";
import type { UpdateLayout } from "./update.layout";

import { backupDatabase, countMigrations, restoreDatabase } from "./update.db";
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
  fetchLatestVersion,
  parseSha256Sums,
  releaseAssetUrl,
  sha256File,
} from "./update.release";
import { createJobRecorder, readHistory, readStatus } from "./update.status";

/*
 * `booth update` and `booth rollback`, behind the machine they act on.
 * The booth keeps running the old release through every step up to the
 * switch; from the switch on, any failure goes back to it.
 */

/** Room the download and the unpacked release need, with margin. */
export const MIN_FREE_BYTES = 1024 ** 3;
/** How long a new release gets to come up before it's rolled back. */
export const CHECK_TIMEOUT_MS = 120_000;
const CHECK_INTERVAL_MS = 3_000;

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

/** One job at a time: a file holding the pid of the process that runs it. */
async function takeLock(stateDir: string): Promise<() => Promise<void>> {
  await mkdir(stateDir, { recursive: true, mode: 0o755 });
  const path = join(stateDir, "lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return () => rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const pid = Number(await readFile(path, "utf8").catch(() => ""));
      if (pid > 0 && isAlive(pid)) {
        throw new UpdateRefused(
          `Another update or rollback runs (pid ${pid}).`,
        );
      }
      // Its process is gone: the lock is stale.
      await rm(path, { force: true });
    }
  }

  throw new UpdateRefused("Couldn't take the update lock.");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ---- folders -----------------------------------------------------------------

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

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

async function waitHealthy(
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

const newJobId = (now: Date) => now.toISOString().replaceAll(/[:.]/gu, "-");

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
  const unlock = resumeJobId ? async () => {} : await takeLock(layout.stateDir);

  try {
    return await update({ layout, host, requested, resumeJobId });
  } finally {
    await unlock();
  }
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
  const version = requested ?? (await fetchLatestVersion(host.fetch));

  if (!isReleaseVersion(version)) {
    throw new UpdateRefused(`Not a release version: ${version}`);
  }

  if (host.arch !== "arm64") {
    throw new UpdateRefused("Releases are built for arm64 only.");
  }

  const repo = await readRepoState(layout);
  const runningDir = repo.kind === "missing" ? null : repo.dir;
  const from = runningDir ? host.releaseOf(runningDir) : null;

  if (from === version && repo.kind === "release") {
    return { kind: "up-to-date", version };
  }

  const resumed = resumeJobId ? await readStatus(layout.stateDir) : undefined;
  const startedAt = host.now();
  const recorder = await createJobRecorder({
    stateDir: layout.stateDir,
    now: host.now,
    job:
      resumed?.jobId === resumeJobId && resumed
        ? resumed
        : {
            kind: "update",
            jobId: resumeJobId ?? newJobId(startedAt),
            from,
            to: version,
            state: "running",
            step: "preflight",
            startedAt: startedAt.toISOString(),
            updatedAt: startedAt.toISOString(),
            error: null,
            backup: null,
            migrated: null,
          },
  });
  const say = (message: string) => host.log(message);
  let switched = false;
  let previousDir = runningDir;
  let dbPath: string | null = null;
  let migrationsBefore: number | null = null;

  try {
    await recorder.update({ step: "preflight" });

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
        const after = await readStatus(layout.stateDir);

        if (after?.jobId === recorder.job.jobId && after.state === "running") {
          await recorder.finish({
            state: "failed",
            error: `The v${version} CLI stopped (exit ${exitCode}) during ${after.step}.`,
          });
        }

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

    await recorder.update({ step: "setup" });
    await host.setupSystem();

    await recorder.update({ step: "backup" });
    dbPath = runningDir
      ? await realpath(join(engineDataPath(runningDir), ENGINE_DB_FILE)).catch(
          () => null,
        )
      : null;
    if (dbPath) {
      migrationsBefore = countMigrations(dbPath);
      const backup = await backupDatabase({
        dbPath,
        backupsDir: layout.backupsDir,
        label: `${recorder.job.jobId}-${from ?? "none"}-to-${version}`,
      });
      await recorder.update({ backup });
      say(`Database backed up to ${backup}`);
    }

    await recorder.update({ step: "switch" });
    if (repo.kind === "checkout" && from) {
      previousDir = await moveCheckout(layout, repo.dir, from);
    }
    await pointRepoAt(layout, releaseDir);
    switched = true;

    await recorder.update({ step: "restart" });
    await host.restartBooth();

    await recorder.update({ step: "check" });
    const verdict = await waitHealthy(host, layout);
    const migrated = dbPath
      ? countMigrations(dbPath) !== migrationsBefore
      : null;
    await recorder.update({ migrated });

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
      await rm(`${releaseDirFor(layout, version)}.tmp`, {
        recursive: true,
        force: true,
      });
      await recorder.finish({ state: "failed", error: reason });
      return { kind: "finished", job: recorder.job };
    }

    say(`${reason} Going back to ${from}.`);
    await recorder.update({ step: "rollback", error: reason });

    try {
      await host.stopBooth();
      const { backup, migrated } = recorder.job;
      if (dbPath && backup && migrated !== false) {
        await restoreDatabase(backup, dbPath);
        await host.chownToServiceUser(dbPath);
      }
      await pointRepoAt(layout, previousDir);
      await host.startBooth();
      const again = await waitHealthy(host, layout);
      await recorder.finish({
        state: "rolled-back",
        error: again.ok
          ? reason
          : `${reason} ${from} didn't start again either: ${again.reason}.`,
      });
    } catch (rollbackError) {
      await recorder.finish({
        state: "rolled-back",
        error: `${reason} Going back failed too: ${errorMessage(rollbackError)}`,
      });
    }

    return { kind: "finished", job: recorder.job };
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
  const unlock = await takeLock(layout.stateDir);

  try {
    return await rollback({ layout, host, mode });
  } finally {
    await unlock();
  }
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

  if (repo.kind !== "release") {
    throw new UpdateRefused(
      "This booth doesn't run a release: nothing to go back to.",
    );
  }

  const current = host.releaseOf(repo.dir);
  const history = await readHistory(layout.stateDir);
  const installed = history.find(
    (job) =>
      job.kind === "update" && job.state === "done" && job.to === current,
  );
  const target = installed?.from ?? null;
  let targetDir: string | undefined;

  for (const candidate of target ? releaseDirCandidates(layout, target) : []) {
    if (await exists(candidate)) {
      targetDir = candidate;
      break;
    }
  }

  if (!installed || !target || !targetDir) {
    throw new UpdateRefused("No earlier release on this booth to go back to.");
  }

  if (installed.migrated && mode === "keep-db") {
    throw new UpdateRefused(
      `v${current} changed the database, so ${target} can't run on it. ` +
        "`sudo booth rollback --restore-db` restores the backup taken before " +
        `the update (${installed.updatedAt}): visits since are lost.`,
    );
  }

  if (mode === "restore-db" && !installed.backup) {
    throw new UpdateRefused("The update to v" + current + " kept no backup.");
  }

  const startedAt = host.now();
  const recorder = await createJobRecorder({
    stateDir: layout.stateDir,
    now: host.now,
    job: {
      kind: "rollback",
      jobId: newJobId(startedAt),
      from: current,
      to: target,
      state: "running",
      step: "switch",
      startedAt: startedAt.toISOString(),
      updatedAt: startedAt.toISOString(),
      error: null,
      backup: mode === "restore-db" ? installed.backup : null,
      migrated: null,
    },
  });

  try {
    await host.stopBooth();

    if (mode === "restore-db" && installed.backup) {
      const dbPath = await realpath(
        join(engineDataPath(repo.dir), ENGINE_DB_FILE),
      );
      await restoreDatabase(installed.backup, dbPath);
      await host.chownToServiceUser(dbPath);
    }

    await pointRepoAt(layout, targetDir);
    await recorder.update({ step: "restart" });
    await host.startBooth();
    await recorder.update({ step: "check" });
    const verdict = await waitHealthy(host, layout);

    if (!verdict.ok) {
      throw new Error(`${target} didn't start: ${verdict.reason}.`);
    }

    await recorder.finish({ state: "done" });
    host.log(`The booth runs ${target} again.`);
  } catch (error) {
    // Back to the release it ran, which was up.
    await host.stopBooth().catch(() => {});
    await pointRepoAt(layout, repo.dir);
    await host.startBooth().catch(() => {});
    await recorder.finish({ state: "failed", error: errorMessage(error) });
  }

  return { kind: "finished", job: recorder.job };
}

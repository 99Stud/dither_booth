import { readFileSync } from "node:fs";

import type { ProcessIdentity } from "#isomorphic/booth-update";

/*
 * A process's identity on a Linux booth: its pid, the boot it belongs
 * to and its start time. A pid alone is reused after a reboot, or once a
 * process exits; these three together name one process and no other.
 */

const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";

const read = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
};

/** `/proc/<pid>/stat`'s start time, in clock ticks since boot. */
function startedTicks(pid: number): number | null {
  const stat = read(`/proc/${pid}/stat`);
  if (!stat) return null;
  // The command name sits in parentheses and may hold spaces: split after it.
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const ticks = Number(fields[19]);
  return Number.isFinite(ticks) ? ticks : null;
}

/** This process's identity; null off Linux (no `/proc`). */
export function currentProcessIdentity(): ProcessIdentity | null {
  const bootId = read(BOOT_ID_PATH);
  const ticks = startedTicks(process.pid);
  return bootId && ticks !== null
    ? { pid: process.pid, bootId, startedTicks: ticks }
    : null;
}

/**
 * Whether the process `identity` names still runs: same boot, a process
 * at that pid, started at the same tick. Another user's process (root's
 * job, read by the service user) is still readable in `/proc`.
 */
export function isProcessAlive(identity: ProcessIdentity): boolean {
  if (read(BOOT_ID_PATH) !== identity.bootId) return false;
  return startedTicks(identity.pid) === identity.startedTicks;
}

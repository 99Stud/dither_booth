/*
 * `systemctl` as the service user: the admin's System page, and the
 * engine starting an update Studio asked for. The booth's polkit rule
 * (`booth service`) says which ones it may run; anything else comes back
 * as `not-permitted`.
 */

export type SystemctlRun = (
  args: string[],
) => Promise<{ exitCode: number; stderr: string }>;

export type SystemctlOutcome =
  | { ok: true }
  | {
      ok: false;
      /** `not-permitted`: the booth's polkit rule or units are missing or old. */
      code: "not-permitted" | "failed";
      message: string;
      exitCode: number;
      stderr: string;
    };

// What systemctl prints when polkit says no, or the unit isn't installed.
const NOT_PERMITTED =
  /access denied|interactive authentication required|unit \S+ not found/iu;

export const NOT_PERMITTED_MESSAGE =
  "The booth doesn't allow this yet. Run `sudo booth service` on the booth.";

/** Runs `systemctl <args>`; never throws. */
export async function runSystemctl(
  args: string[],
  run: SystemctlRun,
): Promise<SystemctlOutcome> {
  let outcome: Awaited<ReturnType<SystemctlRun>>;

  try {
    outcome = await run(["systemctl", ...args]);
  } catch (error) {
    outcome = {
      exitCode: -1,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  if (outcome.exitCode === 0) return { ok: true };

  const stderr = outcome.stderr.trim();

  return {
    ok: false,
    code: NOT_PERMITTED.test(stderr) ? "not-permitted" : "failed",
    message: NOT_PERMITTED.test(stderr)
      ? NOT_PERMITTED_MESSAGE
      : stderr || `systemctl exited with ${outcome.exitCode}.`,
    exitCode: outcome.exitCode,
    stderr,
  };
}

/** Runs the command on the machine the admin server runs on. */
export const hostSystemctlRun: SystemctlRun = async (args) => {
  // `Bun.spawn` throws when the binary is missing: `runSystemctl` reports it.
  const proc = Bun.spawn(args, {
    stderr: "pipe",
    stdin: "ignore",
    stdout: "ignore",
  });
  const [stderr, exitCode] = await Promise.all([
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr };
};

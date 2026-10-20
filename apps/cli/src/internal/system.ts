import {
  SERVICE_BUN,
  SERVICE_BUN_DIR,
  SERVICE_HOME,
  SERVICE_USER,
} from "#internal/config";

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  allowFailure?: boolean;
  /** Written to the command's stdin; without it, stdin is closed. */
  input?: string;
};

export type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

// Thrown when a command has already reported its own failure to the user and
// just needs to set the process exit code without an extra error line.
export class SilentExit extends Error {
  exitCode: number;

  constructor(exitCode: number) {
    super("silent-exit");
    this.name = "SilentExit";
    this.exitCode = exitCode;
  }
}

export class CommandError extends Error {
  exitCode: number;

  constructor(command: string[], exitCode: number, stderr: string) {
    super(
      `Command failed (${exitCode}): ${command.join(" ")}${
        stderr ? `\n${stderr.trim()}` : ""
      }`,
    );
    this.name = "CommandError";
    this.exitCode = exitCode;
  }
}

// Bun.spawn throws synchronously when the executable is missing (ENOENT).
// Treat that as exit code 127 so callers can handle it like any other failure.
const EXECUTABLE_NOT_FOUND = 127;

// Runs a command inheriting stdio so the user sees live output.
export async function run(
  command: string[],
  options: RunOptions = {},
): Promise<number> {
  let exitCode: number;

  try {
    const proc = Bun.spawn(command, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    exitCode = await proc.exited;
  } catch (error) {
    if (options.allowFailure) {
      return EXECUTABLE_NOT_FOUND;
    }

    throw new CommandError(
      command,
      EXECUTABLE_NOT_FOUND,
      error instanceof Error ? error.message : String(error),
    );
  }

  if (exitCode !== 0 && !options.allowFailure) {
    throw new CommandError(command, exitCode, "");
  }

  return exitCode;
}

// Runs a command and captures its output without printing it.
export async function capture(
  command: string[],
  options: RunOptions = {},
): Promise<RunResult> {
  let proc: Bun.Subprocess<"ignore" | Blob, "pipe", "pipe">;

  try {
    proc = Bun.spawn(command, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    if (options.allowFailure) {
      return { exitCode: EXECUTABLE_NOT_FOUND, stdout: "", stderr: "" };
    }

    throw new CommandError(
      command,
      EXECUTABLE_NOT_FOUND,
      error instanceof Error ? error.message : String(error),
    );
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0 && !options.allowFailure) {
    throw new CommandError(command, exitCode, stderr);
  }

  return { exitCode, stdout, stderr };
}

export function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

// `sudo booth install` runs as root, but the service runs as SERVICE_USER
// from its home: Bun, the repo, PM2 and the mkcert CA must belong to that
// user, or the service can't read or write them. Steps that create those
// files go through here. Bun's dir leads PATH so scripts that spawn `bun`
// find the same binary.
export function asServiceUser(command: string[]): string[] {
  if (!isRoot()) {
    return [
      "env",
      `PATH=${SERVICE_BUN_DIR}:${process.env.PATH ?? "/usr/bin:/bin"}`,
      ...command,
    ];
  }

  return [
    "runuser",
    "-u",
    SERVICE_USER,
    "--",
    "env",
    `HOME=${SERVICE_HOME}`,
    `PATH=${SERVICE_BUN_DIR}:/usr/local/bin:/usr/bin:/bin`,
    ...command,
  ];
}

export function serviceBun(args: string[]): string[] {
  return asServiceUser([SERVICE_BUN, ...args]);
}

export async function serviceBunExists(): Promise<boolean> {
  return Bun.file(SERVICE_BUN).exists();
}

// Gives SERVICE_USER a path root created, e.g. the repo under /opt or the
// data dir on the SSD. No-op when not root: the files are already the user's.
export async function chownToServiceUser(path: string): Promise<void> {
  if (!isRoot()) {
    return;
  }

  await run(["chown", "-R", `${SERVICE_USER}:${SERVICE_USER}`, path]);
}

export function isLinux(): boolean {
  return process.platform === "linux";
}

export type SupportedArch = "arm64" | "x64";

export function detectArch(): SupportedArch | undefined {
  if (process.arch === "arm64") {
    return "arm64";
  }

  if (process.arch === "x64") {
    return "x64";
  }

  return undefined;
}

// Best-effort LAN IPv4 detection, matching `hostname -I` from the local setup docs.
export async function detectLanIp(): Promise<string | undefined> {
  const result = await capture(
    ["bash", "-lc", "hostname -I 2>/dev/null | awk '{print $1}'"],
    { allowFailure: true },
  );

  const ip = result.stdout.trim();

  return ip.length > 0 ? ip : undefined;
}

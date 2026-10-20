export type NmcliResult = { exitCode: number; stdout: string; stderr: string };

/** Runs `nmcli` with the given arguments, as the engine's user. */
export type Nmcli = (args: string[]) => Promise<NmcliResult>;

/** Thrown when NetworkManager isn't there: a laptop in development. */
export class NetworkManagerUnavailableError extends Error {
  constructor() {
    super("NetworkManager isn't available on this machine.");
    this.name = "NetworkManagerUnavailableError";
  }
}

export const runNmcli: Nmcli = async (args) => {
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;

  try {
    proc = Bun.spawn(["nmcli", ...args], {
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });
  } catch {
    throw new NetworkManagerUnavailableError();
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode: await proc.exited, stderr, stdout };
};

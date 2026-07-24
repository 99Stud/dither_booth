import { resolveRepoRoot } from "#internal/config";
import { getSession } from "#internal/session";

export type BoothContext = {
  repoRoot: string;
  assumeYes: boolean;
  ip?: string;
};

/** @deprecated Use BoothContext — kept as an alias for gradual migration. */
export type CommandContext = BoothContext;

export function buildBoothContext(options: { ip?: string } = {}): BoothContext {
  const session = getSession();

  return {
    repoRoot: resolveRepoRoot(),
    assumeYes: session.assumeYes,
    ip: options.ip,
  };
}

/**
 * The release the booth runs, as `git describe` names the checkout it runs
 * from (`0.6.1`, or `0.6.1-3-gabc1234` past the tag). Read once at start.
 */
export function readRelease(repoRoot: string): string {
  const proc = Bun.spawnSync(["git", "describe", "--tags", "--always"], {
    cwd: repoRoot,
    stderr: "ignore",
  });
  const described = proc.exitCode === 0 ? proc.stdout.toString().trim() : "";
  return described ? described.replace(/^v/u, "") : "0.0.0-dev";
}

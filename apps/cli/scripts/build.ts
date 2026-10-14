import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const appRoot = resolve(dirname(Bun.fileURLToPath(import.meta.url)), "..");
const distDirectory = resolve(appRoot, "dist");
const entrypoint = resolve(appRoot, "src/index.ts");

// arm64 = Raspberry Pi (64-bit OS), x64 = local/dev linux. Workspace deps are
// bundled (no `packages: external`) so the binary is fully standalone.
const TARGETS = [
  { target: "bun-linux-arm64", outfile: "booth-linux-arm64" },
  { target: "bun-linux-x64", outfile: "booth-linux-x64" },
] as const;

// Semver without the leading `v`, as tagged (`v0.4.0`, `v1.0.0-rc.1`).
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function describeGitVersion(): Promise<string | null> {
  const proc = Bun.spawn(
    ["git", "describe", "--tags", "--match", "v*", "--dirty"],
    { cwd: appRoot, stdout: "pipe", stderr: "ignore" },
  );
  const output = (await new Response(proc.stdout).text()).trim();

  return (await proc.exited) === 0 && output.length > 0 ? output : null;
}

// The tag a release is built from, so `booth --version` always matches the
// GitHub release that ships the binary. `BOOTH_VERSION` overrides it.
async function resolveVersion(): Promise<string> {
  const fromEnv = process.env.BOOTH_VERSION?.trim();
  if (fromEnv) return fromEnv.replace(/^v/, "");

  if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME) {
    const tagVersion = process.env.GITHUB_REF_NAME.replace(/^v/, "");

    if (!SEMVER_PATTERN.test(tagVersion)) {
      console.error(
        `Release tag ${process.env.GITHUB_REF_NAME} is not a semver tag (vX.Y.Z).`,
      );
      process.exit(1);
    }

    return tagVersion;
  }

  // Local builds: `v0.4.0` on a tagged commit, `v0.4.0-3-gabc1234` past it.
  const described = await describeGitVersion();
  return described ? described.replace(/^v/, "") : "0.0.0-dev";
}

const version = await resolveVersion();

await rm(distDirectory, { recursive: true, force: true });

for (const { target, outfile } of TARGETS) {
  console.log(`Building ${outfile} (${target}) v${version}...`);

  const proc = Bun.spawn(
    [
      "bun",
      "build",
      entrypoint,
      "--compile",
      "--minify",
      `--target=${target}`,
      "--define",
      `BOOTH_CLI_VERSION=${JSON.stringify(version)}`,
      "--outfile",
      resolve(distDirectory, outfile),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error(`Build failed for ${target}`);
    process.exit(exitCode);
  }
}

console.log(`Done. Binaries written to ${distDirectory}`);

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

await rm(distDirectory, { recursive: true, force: true });

for (const { target, outfile } of TARGETS) {
  console.log(`Building ${outfile} (${target})...`);

  const proc = Bun.spawn(
    [
      "bun",
      "build",
      entrypoint,
      "--compile",
      "--minify",
      `--target=${target}`,
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

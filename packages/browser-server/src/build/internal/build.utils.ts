import { mkdir, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isEnoentError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

export function toDistRelative(distDirectory: string, absolutePath: string) {
  const rel = relative(distDirectory, absolutePath);

  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Build output outside dist: ${absolutePath}`);
  }

  return rel.split(sep).join("/");
}

export async function copyPublicAssets(
  sourceDirectory: string,
  targetDirectory: string,
  blockedPaths: Set<string>,
) {
  const copiedPaths: string[] = [];

  async function copyDirectory(currentSourceDirectory: string) {
    const entries = await readdir(currentSourceDirectory, {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (isEnoentError(error)) {
        return [];
      }

      throw error;
    });

    for (const entry of entries) {
      const sourcePath = resolve(currentSourceDirectory, entry.name);
      const publicRelativePath = relative(sourceDirectory, sourcePath)
        .split(sep)
        .join("/");
      const targetPath = resolve(targetDirectory, publicRelativePath);

      if (entry.isDirectory()) {
        await mkdir(targetPath, { recursive: true });
        await copyDirectory(sourcePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (blockedPaths.has(publicRelativePath)) {
        throw new Error(
          `Public asset would overwrite build output: ${publicRelativePath}`,
        );
      }

      await mkdir(resolve(targetPath, ".."), { recursive: true });
      await Bun.write(targetPath, Bun.file(sourcePath));
      copiedPaths.push(publicRelativePath);
    }
  }

  await copyDirectory(sourceDirectory);

  return copiedPaths;
}

import { readFile, readdir, statfs } from "node:fs/promises";
import os from "node:os";

import type { SystemReaderDeps } from "./system.reader";

/*
 * The reader's dependencies on the machine the admin server runs on. Each
 * rejects when the file, mount or binary isn't there, which the reader
 * turns into an unavailable reading.
 */
export const hostSystemReaderDeps: SystemReaderDeps = {
  // `fs.readFile` reads to the end: `/proc` files report a size of 0.
  readFile: (path) => readFile(path, "utf8"),
  listDir: (path) => readdir(path),
  statfs: (path) => statfs(path),
  async run(args) {
    // `Bun.spawn` throws when the binary is missing: let it reject.
    const proc = Bun.spawn(args, {
      stderr: "ignore",
      stdin: "ignore",
      stdout: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);

    return { exitCode, stdout };
  },
  os,
  now: () => Date.now(),
};

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSetupServerAccess } from "./network.setup-server-access";

describe("setup server access", () => {
  test("only the token in the owner-only file opens it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dither-booth-token-"));
    const tokenPath = join(directory, "runtime/setup-server-token");

    try {
      const access = await createSetupServerAccess(tokenPath);
      const token = readFileSync(tokenPath, "utf8");

      expect(statSync(tokenPath).mode & 0o777).toBe(0o600);
      expect(access.verify(token)).toBe(true);
      expect(access.verify("0".repeat(token.length))).toBe(false);
      expect(access.verify(undefined)).toBe(false);
      expect(access.verify("short")).toBe(false);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});

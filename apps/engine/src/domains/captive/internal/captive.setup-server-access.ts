import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SetupServerAccess = {
  verify: (token: string | undefined) => boolean;
};

/**
 * A fresh token on every engine start, in a file only the booth's user can
 * read. The setup server sends it with `captive.*` calls; a browser, even one
 * going through the Shutter's proxy, never has it.
 */
export async function createSetupServerAccess(
  tokenPath: string,
): Promise<SetupServerAccess> {
  const token = randomBytes(32).toString("hex");
  const expected = Buffer.from(token);

  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  await writeFile(tokenPath, token, { mode: 0o600 });

  return {
    verify: (candidate) => {
      if (!candidate) return false;
      const given = Buffer.from(candidate);
      return (
        given.length === expected.length && timingSafeEqual(given, expected)
      );
    },
  };
}

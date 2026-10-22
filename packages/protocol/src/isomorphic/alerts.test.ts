import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ALERT_KEYS, ALERT_WORDING, alertWording } from "#isomorphic/alerts";

const MIGRATIONS = join(import.meta.dir, "../../../../supabase/migrations");

describe("alerts", () => {
  test("the Hub's alert_key_known check lists exactly these keys", () => {
    const sql = readdirSync(MIGRATIONS)
      .sort()
      .map((file) => readFileSync(join(MIGRATIONS, file), "utf8"))
      .join("\n");
    const check =
      sql.match(/alert_key_known check \(key in \(([^)]*)\)\)/u)?.[1] ?? "";
    const keys = [...check.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    expect(keys.sort()).toEqual([...ALERT_KEYS].sort());
  });

  test("every key has words, none of them empty", () => {
    for (const key of ALERT_KEYS) {
      const { what, todo, fixed } = ALERT_WORDING[key];
      expect([what, todo, fixed].every((text) => text.trim().length > 0)).toBe(
        true,
      );
    }
  });

  test("a key this release doesn't know still gets words", () => {
    expect(alertWording("printer.on-fire").todo).toBe("Check the booth.");
  });
});

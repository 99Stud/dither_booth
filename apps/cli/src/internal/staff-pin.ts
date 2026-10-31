import { Database } from "bun:sqlite";

export type StaffPinCheck = { set: boolean } | { unreadable: string };

/**
 * Whether the staff PIN is set, read straight from the engine's database
 * (read-only), so `booth doctor` and `booth install` need no engine running.
 */
export function readStaffPinSet(dbPath: string): StaffPinCheck {
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<{ id: number }, []>("select id from darkroom_access where id = 1")
      .get();
    return { set: row !== null };
  } catch (error) {
    return {
      unreadable: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db?.close();
  }
}

import { Database } from "bun:sqlite";

export type HubRegistrationCheck =
  | { registered: true; boothName: string }
  | { registered: false }
  | { unreadable: string };

/**
 * Whether the engine is registered with the Hub, read straight from its
 * database (read-only), so `booth doctor` needs no engine running.
 */
export function readHubRegistration(dbPath: string): HubRegistrationCheck {
  let db: Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db
      .query<{ booth_name: string }, []>(
        "select booth_name from hub_registration where id = 1",
      )
      .get();
    return row
      ? { registered: true, boothName: row.booth_name }
      : { registered: false };
  } catch (error) {
    return {
      unreadable: error instanceof Error ? error.message : String(error),
    };
  } finally {
    db?.close();
  }
}

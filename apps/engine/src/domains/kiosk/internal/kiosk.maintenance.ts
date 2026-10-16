import type { DbExecutor } from "#db/internal/db.types";

import { kioskMaintenanceTable } from "#db/internal/db.schema";

export type KioskMaintenanceState = {
  enabled: boolean;
  /** When it was last switched, or null if it never was. */
  updatedAt: Date | null;
};

/**
 * Whether the booth is in maintenance, kept in SQLite so a kiosk reload or
 * an engine restart keeps the photo booth locked.
 */
export type KioskMaintenance = {
  get: () => KioskMaintenanceState;
  set: (enabled: boolean) => KioskMaintenanceState;
};

/** Over JSON: `updatedAt` as an ISO string, as the browser receives it. */
export const serializeKioskMaintenance = ({
  enabled,
  updatedAt,
}: KioskMaintenanceState) => ({
  enabled,
  updatedAt: updatedAt?.toISOString() ?? null,
});

export function createKioskMaintenance({
  db,
  now = () => Date.now(),
}: {
  db: DbExecutor;
  now?: () => number;
}): KioskMaintenance {
  return {
    get() {
      const row = db
        .select({
          enabled: kioskMaintenanceTable.enabled,
          updatedAt: kioskMaintenanceTable.updatedAt,
        })
        .from(kioskMaintenanceTable)
        .get();

      return {
        enabled: row?.enabled ?? false,
        updatedAt: row?.updatedAt ?? null,
      };
    },
    set(enabled) {
      const updatedAt = new Date(now());

      db.insert(kioskMaintenanceTable)
        .values({ id: 1, enabled, updatedAt })
        .onConflictDoUpdate({
          target: kioskMaintenanceTable.id,
          set: { enabled, updatedAt },
        })
        .run();

      return { enabled, updatedAt };
    },
  };
}

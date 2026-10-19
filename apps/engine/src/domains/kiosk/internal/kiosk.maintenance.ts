import type { MaintenanceReason } from "@dither-booth/shared/kiosk";

import { logKioskEvent } from "@dither-booth/logging";
import { createId } from "@paralleldrive/cuid2";

import type { DbExecutor } from "#db/internal/db.types";

import { kioskMaintenanceTable } from "#db/internal/db.schema";

import type { KioskChannel } from "./kiosk.channel";

import { KIOSK_LOG_SOURCE } from "./kiosk.constants";

export type KioskMaintenanceState = {
  /** Whether guests see maintenance: staff turned it on, or the printer did. */
  enabled: boolean;
  /** Staff's switch in admin, kept in SQLite. */
  manual: boolean;
  /** The printer can't print, as the printer watch last decided. */
  printerFault: boolean;
  /** Whether a printer fault puts the booth in maintenance. */
  automatic: boolean;
  /** What currently keeps the booth in maintenance. */
  reasons: MaintenanceReason[];
  /** When staff last switched it, or null if they never did. */
  updatedAt: Date | null;
};

/**
 * Whether the booth is in maintenance, and why. Staff's switch survives a
 * kiosk reload or an engine restart; the printer's reason is rebuilt from the
 * printer's own status. Every change that opens or closes the booth reaches
 * the kiosk pages from here.
 */
export type KioskMaintenance = {
  get: () => KioskMaintenanceState;
  /** Always reaches the pages; `delivered` counts the ones that heard it. */
  setManual: (enabled: boolean) => {
    delivered: number;
    state: KioskMaintenanceState;
  };
  setPrinterFault: (active: boolean) => KioskMaintenanceState;
  /** Kept in memory: back to the default when the engine restarts. */
  setAutomatic: (automatic: boolean) => KioskMaintenanceState;
};

/** Over JSON: `updatedAt` as an ISO string, as the browser receives it. */
export const serializeKioskMaintenance = ({
  updatedAt,
  ...state
}: KioskMaintenanceState) => ({
  ...state,
  updatedAt: updatedAt?.toISOString() ?? null,
});

export function createKioskMaintenance({
  automaticByDefault = true,
  db,
  kioskChannel,
  now = () => Date.now(),
}: {
  automaticByDefault?: boolean;
  db: DbExecutor;
  kioskChannel: Pick<KioskChannel, "broadcast">;
  now?: () => number;
}): KioskMaintenance {
  let printerFault = false;
  let automatic = automaticByDefault;

  const readManual = () => {
    const row = db
      .select({
        enabled: kioskMaintenanceTable.enabled,
        updatedAt: kioskMaintenanceTable.updatedAt,
      })
      .from(kioskMaintenanceTable)
      .get();

    return { manual: row?.enabled ?? false, updatedAt: row?.updatedAt ?? null };
  };

  const get = (): KioskMaintenanceState => {
    const { manual, updatedAt } = readManual();
    const reasons: MaintenanceReason[] = [
      ...(manual ? (["manual"] as const) : []),
      ...(automatic && printerFault ? (["printer"] as const) : []),
    ];

    return {
      automatic,
      enabled: reasons.length > 0,
      manual,
      printerFault,
      reasons,
      updatedAt,
    };
  };

  const broadcast = (state: KioskMaintenanceState) => {
    const commandId = createId();
    const delivered = kioskChannel.broadcast({
      type: "maintenance",
      enabled: state.enabled,
      commandId,
    });

    logKioskEvent("info", KIOSK_LOG_SOURCE, "kiosk-maintenance-changed", {
      details: {
        commandId,
        delivered,
        enabled: state.enabled,
        reasons: state.reasons,
      },
    });

    return delivered;
  };

  /** Applies an in-memory change; tells the pages only if the booth flips. */
  const change = (apply: () => void) => {
    const before = get().enabled;
    apply();
    const state = get();
    if (state.enabled !== before) broadcast(state);
    return state;
  };

  return {
    get,
    setAutomatic: (next) =>
      change(() => {
        automatic = next;
      }),
    setManual(enabled) {
      const updatedAt = new Date(now());

      db.insert(kioskMaintenanceTable)
        .values({ id: 1, enabled, updatedAt })
        .onConflictDoUpdate({
          target: kioskMaintenanceTable.id,
          set: { enabled, updatedAt },
        })
        .run();

      const state = get();
      return { delivered: broadcast(state), state };
    },
    setPrinterFault: (active) =>
      change(() => {
        printerFault = active;
      }),
  };
}

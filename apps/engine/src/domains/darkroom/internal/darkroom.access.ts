import type { DarkroomUnlock } from "@dither-booth/shared/darkroom";

import { TRPCError } from "@trpc/server";

import type { DbExecutor } from "#db/internal/db.types";

import { darkroomAccessTable } from "#db/internal/db.schema";

import {
  DARKROOM_LOCKOUT_MS,
  DARKROOM_MAX_FAILED_UNLOCKS,
  DARKROOM_MAX_LOCKOUT_MS,
  DARKROOM_TOKEN_IDLE_TTL_MS,
} from "./darkroom.constants";

/** Over JSON: `updatedAt` as an ISO string, as the browser receives it. */
export const serializePinStatus = ({
  isSet,
  updatedAt,
}: ReturnType<DarkroomAccess["getPinStatus"]>) => ({
  isSet,
  updatedAt: updatedAt?.toISOString() ?? null,
});

/**
 * Who may open the Darkroom and admin: the staff PIN. The PIN hash lives in
 * SQLite; the tokens it hands out live in memory only, so an engine restart
 * or a new PIN signs every Darkroom and admin out.
 */
export type DarkroomAccess = {
  /**
   * Checks the PIN without opening a session. Throws UNAUTHORIZED or
   * TOO_MANY_REQUESTS; wrong PINs count toward the same lockout as `unlock`.
   */
  checkPin: (pin: string) => Promise<void>;
  /** Trades the PIN for a token. Throws like `checkPin`. */
  unlock: (pin: string) => Promise<DarkroomUnlock>;
  /** Whether the token is live; using it pushes its expiry back. */
  verify: (token: string | undefined) => boolean;
  lock: (token: string | undefined) => void;
  /** Stores a new PIN hash and signs every open Darkroom out. */
  setPin: (pin: string) => Promise<void>;
  getPinStatus: () => { isSet: boolean; updatedAt: Date | null };
};

export function createDarkroomAccess({
  db,
  now = () => Date.now(),
}: {
  db: DbExecutor;
  now?: () => number;
}): DarkroomAccess {
  /** token → expiry, in ms since the epoch. */
  const tokens = new Map<string, number>();
  let failedUnlocks = 0;
  let lockedUntil = 0;
  /** Lockouts since the last right PIN: each one doubles the next. */
  let lockouts = 0;

  const readPinHash = () =>
    db
      .select({ pinHash: darkroomAccessTable.pinHash })
      .from(darkroomAccessTable)
      .get()?.pinHash;

  const checkPin = async (pin: string) => {
    const at = now();

    if (at < lockedUntil) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many wrong PINs. Wait a few minutes and try again.",
      });
    }

    const pinHash = readPinHash();
    const isValid = pinHash ? await Bun.password.verify(pin, pinHash) : false;

    if (!isValid) {
      failedUnlocks += 1;
      if (failedUnlocks >= DARKROOM_MAX_FAILED_UNLOCKS) {
        failedUnlocks = 0;
        lockedUntil =
          at +
          Math.min(
            DARKROOM_LOCKOUT_MS * 2 ** lockouts,
            DARKROOM_MAX_LOCKOUT_MS,
          );
        lockouts += 1;
      }

      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: pinHash
          ? "Wrong PIN."
          : "No staff PIN is set. Run `booth pin` on the booth.",
      });
    }

    failedUnlocks = 0;
    lockouts = 0;
  };

  return {
    checkPin,
    async unlock(pin) {
      await checkPin(pin);

      const token = crypto.randomUUID();
      const expiresAt = now() + DARKROOM_TOKEN_IDLE_TTL_MS;
      tokens.set(token, expiresAt);

      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    verify(token) {
      if (!token) return false;

      const at = now();
      const expiresAt = tokens.get(token);

      if (expiresAt === undefined || expiresAt <= at) {
        tokens.delete(token);
        return false;
      }

      tokens.set(token, at + DARKROOM_TOKEN_IDLE_TTL_MS);
      return true;
    },
    lock(token) {
      if (token) tokens.delete(token);
    },
    async setPin(pin) {
      const pinHash = await Bun.password.hash(pin);
      const updatedAt = new Date(now());

      db.insert(darkroomAccessTable)
        .values({ id: 1, pinHash, updatedAt })
        .onConflictDoUpdate({
          target: darkroomAccessTable.id,
          set: { pinHash, updatedAt },
        })
        .run();

      tokens.clear();
      failedUnlocks = 0;
      lockedUntil = 0;
      lockouts = 0;
    },
    getPinStatus() {
      const row = db
        .select({ updatedAt: darkroomAccessTable.updatedAt })
        .from(darkroomAccessTable)
        .get();

      return { isSet: row !== undefined, updatedAt: row?.updatedAt ?? null };
    },
  };
}

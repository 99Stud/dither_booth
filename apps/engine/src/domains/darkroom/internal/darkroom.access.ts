import type { DarkroomUnlock } from "@dither-booth/shared/darkroom";

import { TRPCError } from "@trpc/server";

import type { DbExecutor } from "#db/internal/db.types";

import { darkroomAccessTable } from "#db/internal/db.schema";

import {
  DARKROOM_LOCKOUT_MS,
  DARKROOM_MAX_FAILED_UNLOCKS,
  DARKROOM_TOKEN_IDLE_TTL_MS,
} from "./darkroom.constants";

/**
 * Who may open the Darkroom. The PIN hash lives in SQLite; the tokens it
 * hands out live in memory only, so an engine restart or a new PIN signs
 * every Darkroom out.
 */
export type DarkroomAccess = {
  /** Trades the PIN for a token. Throws UNAUTHORIZED or TOO_MANY_REQUESTS. */
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

  const readPinHash = () =>
    db
      .select({ pinHash: darkroomAccessTable.pinHash })
      .from(darkroomAccessTable)
      .get()?.pinHash;

  return {
    async unlock(pin) {
      const at = now();

      if (at < lockedUntil) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many wrong PINs. Wait a minute and try again.",
        });
      }

      const pinHash = readPinHash();
      const isValid = pinHash ? await Bun.password.verify(pin, pinHash) : false;

      if (!isValid) {
        failedUnlocks += 1;
        if (failedUnlocks >= DARKROOM_MAX_FAILED_UNLOCKS) {
          failedUnlocks = 0;
          lockedUntil = at + DARKROOM_LOCKOUT_MS;
        }

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: pinHash
            ? "Wrong PIN."
            : "No Darkroom PIN is set. Set one in admin's Control Center.",
        });
      }

      failedUnlocks = 0;
      const token = crypto.randomUUID();
      const expiresAt = at + DARKROOM_TOKEN_IDLE_TTL_MS;
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

import { TRPCError } from "@trpc/server";

import type { DarkroomAccess } from "./darkroom.access";

/**
 * A staff PIN that accepts `validToken` and `validPin` and nothing else, for
 * router tests.
 */
export const createDarkroomAccessStub = (
  validToken?: string,
  validPin?: string,
): DarkroomAccess => ({
  checkPin: async (pin) => {
    if (validPin === undefined || pin !== validPin) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Wrong PIN." });
    }
  },
  unlock: async () => {
    throw new Error("Not used by this test.");
  },
  verify: (token) => validToken !== undefined && token === validToken,
  lock: () => {},
  setPin: async () => {},
  getPinStatus: () => ({ isSet: false, updatedAt: null }),
});

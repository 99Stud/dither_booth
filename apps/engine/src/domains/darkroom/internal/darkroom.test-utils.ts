import type { DarkroomAccess } from "./darkroom.access";

/**
 * A Darkroom that accepts `validToken` and nothing else, for router tests
 * that never touch the PIN.
 */
export const createDarkroomAccessStub = (
  validToken?: string,
): DarkroomAccess => ({
  unlock: async () => {
    throw new Error("Not used by this test.");
  },
  verify: (token) => validToken !== undefined && token === validToken,
  lock: () => {},
  setPin: async () => {},
  getPinStatus: () => ({ isSet: false, updatedAt: null }),
});

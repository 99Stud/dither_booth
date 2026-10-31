import z from "zod";

/** The Shutter route where staff tune the print on the booth iPad. */
export const DARKROOM_PATH = "/darkroom";

/** Carries the token `booth.unlockDarkroom` returns on every engine call. */
export const DARKROOM_TOKEN_HEADER = "x-darkroom-token";

/**
 * 4 to 8 digits: easy to type on the iPad, set per event in admin or with
 * `booth pin`. The same staff PIN opens admin and the Darkroom.
 */
export const darkroomPinSchema = z
  .string()
  .regex(/^\d{4,8}$/, "Use 4 to 8 digits.");

export type DarkroomUnlock = {
  token: string;
  /** ISO time the token expires if it isn't used again before then. */
  expiresAt: string;
};

/** `booth.getDarkroomSession`: what the caller's token opens, if anything. */
export type DarkroomSession = {
  /** No PIN: admin and the Darkroom stay locked until `booth pin`. */
  pinSet: boolean;
  signedIn: boolean;
};

import { z } from "zod";

/**
 * How a booth trades a one-time code, issued by staff on the Hub, for its
 * own session. The Hub stores only the code's sha256; both sides normalise
 * a typed code the same way before hashing it.
 */

/** Ten Crockford base32 characters: no I, L, O or U. */
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * Case, spaces and the dash between the two groups don't matter, and the
 * letters people take for digits (O for 0, I and L for 1) are read as them.
 */
const normalizeCode = (typed: string) =>
  typed
    .toUpperCase()
    .replace(/[\s-]/gu, "")
    .replace(/O/gu, "0")
    .replace(/[IL]/gu, "1");

/**
 * Longest a typed code may be: ten characters, the dash, and a few spaces
 * people add. Inputs that show a code use it too.
 */
export const REGISTRATION_CODE_MAX_TYPED_LENGTH = 16;

export const registrationCodeSchema = z
  .string()
  .max(REGISTRATION_CODE_MAX_TYPED_LENGTH)
  .transform(normalizeCode)
  .pipe(
    z
      .string()
      .regex(
        CODE_PATTERN,
        "A code is ten letters and digits, like 7KQ2M-9XD4T.",
      ),
  );

export const registrationRequestSchema = z.object({
  code: registrationCodeSchema,
});

/** The sha256 of a normalised code, in hex, as the Hub stores it. */
export async function hashRegistrationCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** What the Hub answers a booth that registered. */
export const registrationSchema = z.object({
  booth: z.object({ id: z.uuid(), name: z.string().min(1) }),
  session: z.object({
    accessToken: z.string().min(1),
    /** Single use: every refresh returns the next one, which must be kept. */
    refreshToken: z.string().min(1),
    /** Seconds since the epoch. */
    expiresAt: z.number().int(),
  }),
});

export type Registration = z.infer<typeof registrationSchema>;

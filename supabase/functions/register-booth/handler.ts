import {
  hashRegistrationCode,
  type Registration,
  registrationRequestSchema,
} from "@dither-booth/protocol/registration";

/** The booth a code was issued for, once the code is used up. */
export type ClaimedBooth = {
  boothId: string;
  orgId: string;
  boothName: string;
  /** The Auth user it signed in as before, replaced by this registration. */
  previousAuthUserId: string | null;
};

export type RegisterDeps = {
  /** Uses the code up and names its booth, or null for a bad code. */
  claim: (codeHash: string) => Promise<ClaimedBooth | null>;
  /** Gives the booth a new Auth user, signed in, in place of the old one. */
  createSession: (booth: ClaimedBooth) => Promise<Registration["session"]>;
};

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

/**
 * A booth trading its one-time code for a session. No session is needed to
 * ask: the code is the credential, 50 random bits, single use, 24 hours.
 */
export async function handleRegister(
  req: Request,
  deps: RegisterDeps,
): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "body is not JSON" });
  }

  const parsed = registrationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return reply(400, {
      error: parsed.error.issues[0]?.message ?? "invalid code",
    });
  }

  const booth = await deps.claim(await hashRegistrationCode(parsed.data.code));
  // Unknown, used and expired look the same from outside.
  if (!booth) return reply(404, { error: "unknown, used or expired code" });

  try {
    const session = await deps.createSession(booth);
    const registration: Registration = {
      booth: { id: booth.boothId, name: booth.boothName },
      session,
    };
    return reply(200, registration);
  } catch (error) {
    console.error("registration failed", booth.boothId, error);
    // The code is spent: staff issue a new one.
    return reply(500, { error: "registration failed, issue a new code" });
  }
}

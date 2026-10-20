import {
  type Heartbeat,
  heartbeatSchema,
  PROTOCOL_VERSION,
} from "@dither-booth/protocol/heartbeat";

/** Who a bearer token is: a booth, a valid user who isn't one, or no one. */
export type BoothAuth = { boothId: string } | "invalid-token" | "not-a-booth";

export type HeartbeatDeps = {
  authenticate: (token: string) => Promise<BoothAuth>;
  /** Stores the heartbeat and opens or closes alerts. */
  evaluate: (
    boothId: string,
    heartbeat: Heartbeat,
  ) => Promise<"ok" | "unknown-booth">;
};

const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

/**
 * One booth's heartbeat. The booth is whoever the token says it is: its id
 * comes from the Auth user's app_metadata, never from the body.
 */
export async function handleHeartbeat(
  req: Request,
  deps: HeartbeatDeps,
): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, { error: "missing bearer token" });

  const auth = await deps.authenticate(token);
  if (auth === "invalid-token") return reply(401, { error: "invalid token" });
  if (auth === "not-a-booth") return reply(403, { error: "not a booth" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "body is not JSON" });
  }

  const parsed = heartbeatSchema.safeParse(body);
  if (!parsed.success) {
    return reply(400, {
      error: "invalid heartbeat",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  // A booth newer than the Hub: say so, so it doesn't look like a fault.
  if (parsed.data.protocol > PROTOCOL_VERSION) {
    return reply(422, {
      error: "unsupported protocol",
      supported: PROTOCOL_VERSION,
    });
  }

  try {
    const result = await deps.evaluate(auth.boothId, parsed.data);
    if (result === "unknown-booth") {
      return reply(404, { error: "unknown booth" });
    }
  } catch (error) {
    console.error("heartbeat failed", auth.boothId, error);
    return reply(500, { error: "internal error" });
  }

  return reply(200, { ok: true });
}

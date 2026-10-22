import { z } from "zod";

import {
  bearerToken,
  preflight,
  replyToBrowser as reply,
} from "../_shared/browser.ts";

export type BoothCodeDeps = {
  /** The signed-in user a token belongs to, or null. */
  authenticate: (token: string) => Promise<string | null>;
  /** The booth's org and name, or null if the Hub has no such booth. */
  findBooth: (
    boothId: string,
  ) => Promise<{ orgId: string; name: string } | null>;
  isMember: (userId: string, orgId: string) => Promise<boolean>;
  /** A new one-time code for the booth, replacing any earlier one. */
  issueCode: (boothId: string) => Promise<{ code: string; expiresAt: string }>;
};

const requestSchema = z.object({ boothId: z.uuid() });

/**
 * Issues a one-time registration code for a booth, to staff of its org, so
 * Studio can register a booth without the SQL editor. The service role that
 * issues it stays here, behind this check.
 */
export async function handleBoothCode(
  req: Request,
  deps: BoothCodeDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  const token = bearerToken(req);
  const userId = token ? await deps.authenticate(token) : null;
  if (!userId) return reply(401, { error: "sign in first" });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply(400, { error: "invalid request" });

  // Someone else's booth answers like a booth that doesn't exist.
  const booth = await deps.findBooth(parsed.data.boothId);
  if (!booth || !(await deps.isMember(userId, booth.orgId))) {
    return reply(404, { error: "unknown booth" });
  }

  try {
    const { code, expiresAt } = await deps.issueCode(parsed.data.boothId);
    return reply(200, { boothName: booth.name, code, expiresAt });
  } catch (error) {
    console.error("issuing a code failed", parsed.data.boothId, error);
    return reply(500, { error: "couldn't issue a code, try again" });
  }
}

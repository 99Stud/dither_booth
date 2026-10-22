import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * For the functions Studio calls from the browser, from its own origin. No
 * cookies are involved: the session travels in the Authorization header.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
};

export const replyToBrowser = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: CORS });

/** The browser's preflight, answered before anything else. */
export const preflight = () =>
  new Response(null, { status: 204, headers: CORS });

/** The bearer token of a request, if it has one. */
export const bearerToken = (req: Request) =>
  req.headers.get("Authorization")?.match(/^Bearer (.+)$/iu)?.[1];

/**
 * The signed-in user a token belongs to, or null. Asks Auth, so a signed-out
 * or removed user is refused now, not when the token expires.
 */
export const createSessionReader =
  (admin: SupabaseClient) =>
  async (token: string): Promise<string | null> => {
    const { data, error } = await admin.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  };

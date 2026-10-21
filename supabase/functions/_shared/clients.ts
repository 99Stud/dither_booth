import { createClient } from "@supabase/supabase-js";

/** Functions keep no session between requests. */
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * A key the runtime provides. The hosted Hub gives the new API keys as JSON
 * maps (`SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`) and may refuse
 * the legacy JWT keys; the local stack may only have the legacy ones.
 */
function runtimeKey(keys: string, legacy: string): string {
  const map = Deno.env.get(keys);
  const key = map
    ? (JSON.parse(map) as Record<string, string>).default
    : undefined;
  const value = key ?? Deno.env.get(legacy);
  if (!value) throw new Error(`neither ${keys} nor ${legacy} is set`);
  return value;
}

/**
 * The secret key. It stays here, on the Hub: it does what a booth may not do
 * itself (store its status, open alerts, create its Auth user).
 */
export const createServiceClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    runtimeKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"),
    NO_SESSION,
  );

/** The public key: what any client uses, for instance to sign in. */
export const createPublicClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    runtimeKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"),
    NO_SESSION,
  );

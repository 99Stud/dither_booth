import { createClient } from "@supabase/supabase-js";

/** Functions keep no session between requests. */
const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * The service role. It stays here, on the Hub: it does what a booth may not
 * do itself (store its status, open alerts, create its Auth user).
 */
export const createServiceClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    NO_SESSION,
  );

/** The public key: what any client uses, for instance to sign in. */
export const createPublicClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    NO_SESSION,
  );

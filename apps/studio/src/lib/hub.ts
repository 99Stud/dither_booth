import { createClient } from "@supabase/supabase-js";

/**
 * A value inlined at build time from BUN_PUBLIC_*. Bun only replaces the
 * variables that are set: an unset one stays `process.env.X`, which throws in
 * a browser. Read this way, it is undefined instead.
 */
const fromBuild = (read: () => string | undefined) => {
  try {
    return read() || undefined;
  } catch {
    return undefined;
  }
};

/**
 * The Hub Studio talks to: production, unless the build or the dev server
 * was given BUN_PUBLIC_* values (the local stack, say). All three are public
 * by design: access comes from the signed-in staff member's session.
 */
export const HUB = {
  url:
    fromBuild(() => process.env.BUN_PUBLIC_HUB_URL) ??
    "https://cvxebmlzjudvxxesgpgq.supabase.co",
  publishableKey:
    fromBuild(() => process.env.BUN_PUBLIC_HUB_PUBLISHABLE_KEY) ??
    "sb_publishable_xnWjSPqPdouux6dQ3NQ0hw_721T875O",
  vapidPublicKey:
    fromBuild(() => process.env.BUN_PUBLIC_VAPID_PUBLIC_KEY) ??
    "BB8s2kM8vH13RlUZcgYNsnPFZjPdx0-nPzAQCd_xShyn-ltRRyFUuIWUNfl8zxrGZn2TbfPHi2JHF9EvP1UobHg",
};

export const hub = createClient(HUB.url, HUB.publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Staff sign in with a code typed in the app: no link to read.
    detectSessionInUrl: false,
    storageKey: "dither-booth.studio-auth",
  },
});

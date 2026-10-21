export const HUB_LOG_SOURCE = "engine.hub";

/** The Hub's production project (Supabase, Paris). */
const PRODUCTION_HUB = {
  url: "https://cvxebmlzjudvxxesgpgq.supabase.co",
  // A publishable key is public by design: it only says which project a
  // request is for. Access comes from the booth's own session.
  publishableKey: "sb_publishable_xnWjSPqPdouux6dQ3NQ0hw_721T875O",
};

export type HubEndpoint = typeof PRODUCTION_HUB;

/**
 * Where the booth registers. HUB_URL and HUB_PUBLISHABLE_KEY point it at
 * another Hub, such as the local stack (`supabase status`).
 */
export function getHubEndpoint(
  env: Record<string, string | undefined> = process.env,
): HubEndpoint {
  return {
    url: env.HUB_URL ?? PRODUCTION_HUB.url,
    publishableKey: env.HUB_PUBLISHABLE_KEY ?? PRODUCTION_HUB.publishableKey,
  };
}

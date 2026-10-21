export const HUB_LOG_SOURCE = "engine.hub";

/**
 * The Hub's production project (Supabase, Paris). A publishable key is public
 * by design: it only says which project a request is for. Access comes from
 * the booth's own session. `getHubOverride` points a dev engine elsewhere.
 */
export const PRODUCTION_HUB = {
  url: "https://cvxebmlzjudvxxesgpgq.supabase.co",
  publishableKey: "sb_publishable_xnWjSPqPdouux6dQ3NQ0hw_721T875O",
};

export type HubEndpoint = typeof PRODUCTION_HUB;

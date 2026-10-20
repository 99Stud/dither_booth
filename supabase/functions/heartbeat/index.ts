import { createClient } from "@supabase/supabase-js";

import { type BoothAuth, handleHeartbeat } from "./handler.ts";

// The service role stays here, on the Hub: a booth only ever holds its own
// session. It is used for what the booth may not do itself (see the
// migrations): store its status and open or close its alerts.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve((req) =>
  handleHeartbeat(req, {
    async authenticate(token): Promise<BoothAuth> {
      // Asks Auth, so a revoked session or a removed user is refused now,
      // not when the token expires.
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return "invalid-token";
      // app_metadata can only be set by the Hub. user_metadata, which the
      // user can edit, is never read.
      const boothId = data.user.app_metadata?.booth_id;
      return typeof boothId === "string" && UUID.test(boothId)
        ? { boothId }
        : "not-a-booth";
    },

    async evaluate(boothId, heartbeat) {
      const { error } = await supabase.rpc("evaluate_heartbeat", {
        p_booth_id: boothId,
        p_heartbeat: heartbeat,
      });
      if (error?.code === "P0002") return "unknown-booth";
      if (error) throw error;
      return "ok";
    },
  }),
);

import { z } from "zod";

import { createServiceClient } from "../_shared/clients.ts";
import { type BoothAuth, handleHeartbeat } from "./handler.ts";

const supabase = createServiceClient();

const boothIdSchema = z.uuid();

/** What evaluate_heartbeat raises for a booth the Hub doesn't have. */
const UNKNOWN_BOOTH = "P0002";

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
      const parsed = boothIdSchema.safeParse(boothId);
      return parsed.success ? { boothId: parsed.data } : "not-a-booth";
    },

    async evaluate(boothId, heartbeat) {
      const { error } = await supabase.rpc("evaluate_heartbeat", {
        p_booth_id: boothId,
        p_heartbeat: heartbeat,
      });
      if (error?.code === UNKNOWN_BOOTH) return "unknown-booth";
      if (error) throw error;
      return "ok";
    },
  }),
);

import { createClient } from "@supabase/supabase-js";

import { type ClaimedBooth, handleRegister } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

// The service role stays here, on the Hub: it creates the booth's Auth user
// and links it to the booth. The booth only ever gets its own session.
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  noSession,
);

/** 32 random bytes, used once to sign in and never stored. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

Deno.serve((req) =>
  handleRegister(req, {
    async claim(codeHash) {
      const { data, error } = await admin.rpc("claim_booth_registration_code", {
        p_code_hash: codeHash,
      });
      if (error) throw error;
      const row = data?.[0];
      return row
        ? {
            boothId: row.booth_id,
            orgId: row.org_id,
            boothName: row.booth_name,
            previousAuthUserId: row.previous_auth_user_id,
          }
        : null;
    },

    async createSession(booth: ClaimedBooth) {
      // A booth registered again (a new Pi, a wiped SSD) leaves its old
      // session behind: deleting the old user ends it.
      if (booth.previousAuthUserId) {
        const { error } = await admin.auth.admin.deleteUser(
          booth.previousAuthUserId,
        );
        if (error && error.status !== 404) throw error;
      }

      // `.invalid` is reserved, so no mail can ever leave for this address.
      const email = `booth-${booth.boothId}@booths.dither.invalid`;
      const password = randomPassword();
      const { data: created, error: createError } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          // app_metadata: only the Hub can set it, so the heartbeat function
          // trusts it to say which booth this is.
          app_metadata: { booth_id: booth.boothId, org_id: booth.orgId },
        });
      if (createError) throw createError;

      const { error: linkError } = await admin
        .from("booth")
        .update({
          auth_user_id: created.user.id,
          registered_at: new Date().toISOString(),
        })
        .eq("id", booth.boothId);
      if (linkError) throw linkError;

      const client = createClient(
        url,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        noSession,
      );
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) throw error ?? new Error("no session");
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? 0,
      };
    },
  }),
);

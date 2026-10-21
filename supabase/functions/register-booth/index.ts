import { createPublicClient, createServiceClient } from "../_shared/clients.ts";
import { type ClaimedBooth, handleRegister } from "./handler.ts";

const admin = createServiceClient();

/** 32 random bytes, used once to sign in and never stored. */
function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Each registration gets its own address, so a user left behind by a failed
 * attempt can never block the next one. `.invalid` is reserved: no mail can
 * ever leave for it.
 */
const boothEmail = (boothId: string) =>
  `booth-${boothId}-${crypto.randomUUID().slice(0, 8)}@booths.dither.invalid`;

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

    // In an order where any failure leaves something a new code can fix:
    // the new user exists and is linked before the old one goes.
    async createSession(booth: ClaimedBooth) {
      const email = boothEmail(booth.boothId);
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
      if (linkError) {
        await admin.auth.admin.deleteUser(created.user.id);
        throw linkError;
      }

      // The booth registered before (a new Pi, a wiped SSD): deleting its old
      // user ends that session. A failure here leaves the old session alive
      // but harmless to this one, so it is logged, not fatal.
      if (booth.previousAuthUserId) {
        const { error } = await admin.auth.admin.deleteUser(
          booth.previousAuthUserId,
        );
        if (error && error.status !== 404) {
          console.error(
            "previous booth user not deleted",
            booth.boothId,
            error,
          );
        }
      }

      const { data, error } =
        await createPublicClient().auth.signInWithPassword({ email, password });
      if (error || !data.session?.expires_at) {
        throw error ?? new Error("no session, or no expiry");
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
      };
    },
  }),
);

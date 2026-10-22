import { createSessionReader } from "../_shared/browser.ts";
import { createServiceClient } from "../_shared/clients.ts";
import { handleBoothCode } from "./handler.ts";

const admin = createServiceClient();

Deno.serve((req) =>
  handleBoothCode(req, {
    authenticate: createSessionReader(admin),

    async findBooth(boothId) {
      const { data, error } = await admin
        .from("booth")
        .select("org_id, name")
        .eq("id", boothId)
        .maybeSingle();
      if (error) throw error;
      return data ? { orgId: data.org_id, name: data.name } : null;
    },

    async isMember(userId, orgId) {
      const { data, error } = await admin
        .from("org_member")
        .select("user_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async issueCode(boothId) {
      const { data: code, error } = await admin.rpc(
        "issue_booth_registration_code",
        {
          p_booth_id: boothId,
        },
      );
      if (error) throw error;
      const { data: booth, error: readError } = await admin
        .from("booth")
        .select("registration_expires_at")
        .eq("id", boothId)
        .single();
      if (readError) throw readError;
      return { code: code as string, expiresAt: booth.registration_expires_at };
    },
  }),
);

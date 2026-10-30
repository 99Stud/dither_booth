import { createSessionReader } from "../_shared/browser.ts";
import { createServiceClient } from "../_shared/clients.ts";
import { fromEventRow } from "../_shared/events.ts";
import { createMemberLookup } from "../_shared/members.ts";
import { handleOnCall } from "./handler.ts";

const admin = createServiceClient();
const members = createMemberLookup(admin);

Deno.serve((req) =>
  handleOnCall(req, {
    authenticate: createSessionReader(admin),

    isPlatformAdmin: members.isPlatformAdmin,
    roleIn: members.roleIn,
    listMembers: members.listMembers,

    async findEvent(eventId) {
      const { data: event, error } = await admin
        .from("event")
        .select("id, name, starts_at, ends_at, booth_id")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      if (!event) return null;
      // Read apart: event_on_call joins event and booth, so an embed of the
      // booth would be ambiguous.
      const { data: booth, error: boothError } = await admin
        .from("booth")
        .select("name, org_id")
        .eq("id", event.booth_id)
        .single();
      if (boothError) throw boothError;
      return {
        ...fromEventRow(event),
        boothName: booth.name,
        boothOrgId: booth.org_id,
      };
    },

    async onCallIds(eventId) {
      const { data, error } = await admin
        .from("event_on_call")
        .select("user_id")
        .eq("event_id", eventId);
      if (error) throw error;
      return data.map((row) => row.user_id);
    },
  }),
);

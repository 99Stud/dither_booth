import { z } from "zod";

import { currentEventSchema } from "./heartbeat.ts";
import { teamMemberSchema } from "./team.ts";

/**
 * Studio's On call section, as the Hub's `on-call` Edge Function reads it
 * (`GET ?eventId=`): an event, and the booth's team with who among them is
 * on call for it. Putting someone on or off call is a plain write on
 * `event_on_call`, which only platform admins may make.
 */

export const onCallRequestSchema = z.object({ eventId: z.uuid() });

export type OnCallRequest = z.input<typeof onCallRequestSchema>;

export const onCallMemberSchema = teamMemberSchema.extend({
  /** Gets the booth's alerts during the event. */
  onCall: z.boolean(),
});

export type OnCallMember = z.infer<typeof onCallMemberSchema>;

export const onCallSchema = z.object({
  event: currentEventSchema.extend({ boothName: z.string() }),
  /** The booth's team: the caller first, then by email. */
  team: z.array(onCallMemberSchema),
});

export type OnCall = z.infer<typeof onCallSchema>;

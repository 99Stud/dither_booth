import type { CurrentEvent } from "@dither-booth/protocol/heartbeat";

/** An event row's window, as the protocol speaks it. */
export const fromEventRow = (row: {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
}): CurrentEvent => ({
  id: row.id,
  name: row.name,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
});

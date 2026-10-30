---
title: "0005 — The booth owns its event's start and end"
description: "Staff set when an event starts and ends in the booth's admin, and only visits in between count in its stats."
sidebar:
  order: 6
---

**An event's start and end are set in the booth's admin and stored on the booth's event (`campaign.starts_at`, `campaign.ends_at`). Only visits that start in between count in the event's stats.**

Status: accepted, 2026-10-27; amended by [0012](/docs/decisions/0012-events-are-booked-on-the-hub/) (events are booked on the Hub, the booth keeps its start and end)

## Context

The Overview counted every visit of the active event. A booth's event often stays active for weeks, across setup, tests and the event itself: on a dev booth the first visit was months before the busiest hour, so the guests per hour, the busiest hour and the pace said little about the event. Staff also test the booth before the doors open, and those visits counted as guests.

The events plan (GitHub #79) had the event's time window authored on the Hub, in Studio, and cached by the booth from the heartbeat answer (#86). The booth would only have known its window once the Hub, Studio and the cache had shipped, and staff on site could not have fixed a wrong time.

## Decision

- The booth's event has an optional **start** and **end** (`starts_at`, `ends_at`, seconds like every engine time). Either side may stay open; when both are set, the end is after the start. A CHECK on `campaign` refuses anything else, whoever writes.
- Staff set them in admin: **Create event** and **Edit details** (which replaces **Rename**).
- The visit stats count only visits that **start** between the start (inclusive) and the end (exclusive). The others are still recorded, still reported to the Hub, and counted apart as `uncounted`. The pause after a win is the one thing not limited to them: a test win still starts it.
- The booth owns its start and end for good. The Hub does not author an event window for the booth.

## Consequences

- Staff can fix the start and end on site, offline, and the Overview follows at once.
- `campaign` was rebuilt to add the CHECK (`drizzle/20261027123116_event_start_end/`); it has no triggers to lose. Existing events keep every row and start with no start or end, so their stats are unchanged until staff set them.
- The events plan changes. Where it has the Hub hold an event window authored in Studio (#79, #84, #86, #87, #88), the Hub should learn the start and end from the booth instead, with its visit reports or heartbeat. That part is not built yet.
- Studio's **event times** (`booth.live_from`, `live_until`) stay on the Hub: they say when a silent booth is an alert, which only the Hub can tell, since a booth that never powers on can't report. They are a different setting with a different word. Staff set both for now.

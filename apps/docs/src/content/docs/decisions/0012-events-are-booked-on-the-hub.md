---
title: "0012 — Events are booked on the Hub; the booth keeps its start and end"
description: "Platform admins book events in Studio (client, booth, window), and alerts follow who is on call for them. The booth's own start and end stay its stats window. Amends 0005."
sidebar:
  order: 13
---

**An event is booked on the Hub, in Studio: a client, a booth, a name and a window. While it's on, a silent booth is an alert and the booth's alerts go to the staff on call for it. The booth keeps its own start and end for its stats. This amends [0005](/docs/decisions/0005-event-start-and-end-on-the-booth/), which said the Hub never authors an event window.**

Status: accepted, 2026-10-30

## Context

Staff wanted to pick, for each event, who gets the booth's alerts: on a night with three people working and five at home, all eight phones rang.

0005 had the booth own its event's start and end, and the Hub learn them from the booth. That serves the stats, but not what an event is to 99Stud:

- **It's a booking, made well before the night.** Someone books Booth A for a client's party on Saturday. That's when on call, a double booking and the client's view are decided, and the booth may be in storage, switched off.
- **Being on call is set up ahead.** Staff should see **You're on call** days before, and check their phone rings. An event that only exists once the booth reports it can only be staffed on the night, by whoever holds the booth.
- **A silent booth needs a window the booth didn't send.** A booth that never powers on can't say it was due somewhere. That's why Studio's event times live on the Hub already (0005, Consequences).
- **Clients, booths and dates are the calendar.** Which booth goes where, never twice at once, for which client, spans every booth. Later client features (their stats, a recap, invoicing) need the event tied to the client's team, which the booth's admin isn't the place to pick.

## Decision

- **The Hub's `event`**: a client team (`org_id`), a booth, a name, `starts_at` and `ends_at` (half-open). One per booth at a time (an exclusion constraint). Platform admins book, change and cancel; the client's team and the booth's team read.
- **On call** (`event_on_call`): staff of the booth's team, picked per event by platform admins. `alert_devices(alert_id)` sends an alert to their devices when it opened during the event, else to the whole team, as before.
- **Silence**: a booth is live during its event times and during its events.
- **The heartbeat answer carries the current event**. The booth doesn't act on it yet.
- **The booth keeps its start and end.** Staff on site still fix them offline, in admin, and the Overview counts by them. The Hub's window is the plan; the booth's is what happened.

### Not chosen

- **The booth reports its event and the Hub copies it.** It follows 0005, but the event would only exist once the booth is set up and online: no planning, no on call ahead, no silence for a booth that never came up.
- **On call per booth instead of per event.** It ships without events, but a booth goes to a different client and crew each night, and the list would have to be reset by hand, then migrated once events exist.

## Consequences

- An event has two records, not linked yet: the Hub's booking (Studio's **Events**) and the booth's event (admin's **Event**, `campaign`). Staff create both. Linking them (the booth taking its name and window from the heartbeat answer, the Hub learning the actual start and end) is later work.
- Event times on a booth (`live_from`, `live_until`) stay for a booth without a booked event. Once every night is booked, they can go.
- A booth or a client team with events can't be deleted: cancel the events first.
- The client's team sees its events, not who runs the booth nor who is on call.

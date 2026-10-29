---
title: "0010 — Studio asks for an update; the booth decides when"
description: "A Studio update request waits on the Hub and reaches the booth in its heartbeat's answer; the booth installs it when its event isn't running and no guest used it for 15 minutes."
sidebar:
  order: 11
---

**Staff ask a booth to update from Studio. The request waits on the Hub, reaches the booth in the answer to its heartbeat, and the booth installs it when it's quiet: not while its event runs, nor within 15 minutes of a visit. The booth reports how it goes in its next heartbeats.**

Status: accepted, 2026-10-29

## Context

Booths now update themselves from tagged releases ([decision 0009](/docs/decisions/0009-booths-install-releases-side-by-side/)), from admin on the booth's own network. Staff with several booths want to update them from wherever they are, in Studio. But booths are offline for days, behind venue networks the Hub can't reach, and the Hub never reaches into a booth: a booth only talks to it, every 30 s ([Hub](/docs/development/hub/#how-a-registered-booth-reports)). And a remote restart must never land on a guest, which staff in Studio can't see coming.

## Decision

- **A request is a row, not a push.** `booth_update` holds one request per booth: the release, who asked, and the state the booth last reported. Asking again replaces it; cancelling deletes it.
- **The heartbeat's answer carries it.** While the request is `requested` or `waiting`, the answer is `{ ok: true, update: { release } }`. The booth needs no new connection and no state of its own: the Hub repeats the request until the booth reports it running.
- **The booth decides when.** It owns its event's start and end ([decision 0005](/docs/decisions/0005-event-start-and-end-on-the-booth/)), and it alone knows when guests use it. It waits while its event runs, for an event with a start and no end, and for 15 minutes after a visit, and reports `waiting` with why.
- **The booth reports, the Hub records.** Each heartbeat carries `update: { release, state, error }` from `booth update`'s own status. A heartbeat whose `release` is the one asked for marks the request `done`, however it got there.
- **Compatible both ways.** The report and the answer's `update` are optional fields: a booth from before ignores the answer's, a Hub from before drops the report. `PROTOCOL_VERSION` stays 0.

### Not chosen

- **A command channel (Realtime, websocket) to the booth.** A second connection to keep alive from venue networks, for a message that can wait 30 s.
- **The Hub picks the moment from Studio's event times.** Those are the Hub's view of when silence is an alert; the booth's own event and its visits are the truth about guests.
- **Update at a set time** (a maintenance window per booth). One more setting staff must get right, for what the booth can tell by itself.
- **The booth stores the request.** A migration, and a request that outlives a cancellation; the Hub already holds it.

## Consequences

- An update asked for during an event happens after it: Studio shows **Waiting to update** and why.
- A booth on the booth Wi-Fi, or offline, gets the request when it next reaches the Hub, and installs it then if it's quiet.
- A failed or rolled-back update isn't retried: staff ask again once they know why.
- There is no failed-update alert yet: Studio shows the state on the booth card.

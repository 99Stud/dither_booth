---
title: About decisions
description: Architecture decision records — why the booth is built the way it is.
sidebar:
  order: 1
---

An **architecture decision record** (ADR) captures one significant decision: the context that forced it, what was decided, and what follows from it. Records are never rewritten after the fact; a decision that changes gets a new record that supersedes the old one.

Write one when a change:

- picks between real alternatives that someone will later ask about (“why not just poll the printer?”),
- is expensive to reverse (a protocol, a storage model, a process boundary),
- or changes a guarantee the rest of the system relies on.

## Format

File: `apps/docs/src/content/docs/decisions/NNNN-short-slug.md`, numbered in sequence.

```md
---
title: "NNNN — Short title"
description: "One sentence: the decision."
sidebar:
  order: N
---

**The decision, as one sentence.**

Status: proposed | accepted, YYYY-MM-DD | superseded by NNNN

## Context

What forced the decision. Facts, measurements, constraints.

## Decision

What we do.

## Consequences

What becomes easier, what becomes harder, what we now have to maintain.
```

## Records

| Record                                                         | Decision                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| [0001](/docs/decisions/0001-persistent-printer-connection/)    | Persistent printer connection and ASB                          |
| [0002](/docs/decisions/0002-hub-deploy-by-supabase/)           | Supabase deploys the Hub                                       |
| [0003](/docs/decisions/0003-print-ready-logos/)                | Logos are kept as they print                                   |
| [0004](/docs/decisions/0004-drizzle-v1/)                       | The engine runs Drizzle v1                                     |
| [0005](/docs/decisions/0005-event-start-and-end-on-the-booth/) | The booth owns its event's start and end                       |
| [0006](/docs/decisions/0006-json-line-logs/)                   | One JSON line per log entry, rotated, read by the admin server |

Longer design work — measurements, state models, acceptance criteria — goes in a [spec](/docs/specs/printer-watchdog/) that the ADR links to.

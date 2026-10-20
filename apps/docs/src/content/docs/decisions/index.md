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

Longer design work — measurements, state models, acceptance criteria — goes in a [spec](/docs/specs/printer-watchdog/) that the ADR links to.

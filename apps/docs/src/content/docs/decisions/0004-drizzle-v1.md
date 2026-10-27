---
title: "0004 — The engine runs Drizzle v1"
description: "The engine moves from drizzle-orm 0.45 to the v1 release candidate, with its folder migrations and relational queries v2."
sidebar:
  order: 5
---

**The engine uses `drizzle-orm` and `drizzle-kit` 1.0.0-rc.5, pinned exactly, ahead of the stable 1.0.**

Status: accepted, 2026-10-27

## Context

Drizzle's next major version, v1, was at release candidate 5. Moving now, while the engine uses little of Drizzle, costs less than moving later across more changes. v1 changes three things the booth relies on:

- **Migrations.** The journal (`drizzle/meta/_journal.json`) is gone. Each migration is a folder, and the record in `__drizzle_migrations` gains `name` and `applied_at`. The migrator refuses to read the old layout.
- **Relational queries.** v1 removes `db.query` as it was (RQB v1). `db.query` is now built from `defineRelations()` and takes filters as objects (`where: { id }`, `orderBy: { createdAt: "desc" }`).
- **Errors.** A failed query throws `DrizzleQueryError`, whose message is the query. The SQLite error, with its `UNIQUE constraint failed` text and code, is its `cause`.

Booths in the field hold a 0.x record and are updated by pulling a release. They can't run a manual step.

## Decision

- `drizzle-kit up` converted `apps/engine/drizzle/` to folders. Every `migration.sql` kept its bytes, so the hashes 0.x recorded still match.
- The engine upgrades each booth's record at its next start, through Drizzle's own upgrade. `runSqliteMigrations` first moves rows that match no migration to `__drizzle_migrations_retired`, which 0.x tolerated and v1 refuses.
- `dbRelations = defineRelations(...)` lists the tables without relations between them: the engine only reads one table at a time through `db.query`.
- Code that tells errors apart reads the `cause` (`isUniqueTicketRefConstraintError`).
- The latest snapshot's CHECK expressions were rewritten without table names, the form v1 generates, so `db:generate` stays quiet until the schema really changes.

## Consequences

- A booth needs nothing beyond the usual update; `db.migrations.test.ts` covers taking over a 0.x record, with and without rows that match no migration.
- The record upgrade is one way for v1, but harmless to older releases: rolling back finds nothing to apply.
- New migrations are named by timestamp, not by an `NNNN_` index.
- An RC can still change before 1.0. The versions are pinned; moving to the next release means re-reading its changelog, running `drizzle-kit up` and `db:generate` (it must find no changes), and the migration tests.

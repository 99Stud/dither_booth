---
title: "0002 — Supabase deploys the Hub"
description: "Supabase's GitHub integration deploys the Hub from main; GitHub holds no Supabase credential."
sidebar:
  order: 3
---

**Supabase's GitHub integration deploys the Hub from `main`, so GitHub holds no Supabase credential.**

Status: proposed, 2026-10-26

## Context

A GitHub Actions workflow (`hub-deploy.yml`) deployed the Hub with the Supabase CLI: `db push`, `functions deploy`, then `config push` for the Auth settings and the sign-in email. For that it held the database password and a personal access token.

Pushing Auth settings goes through Supabase's _Update auth service config_, which needs **Project Settings: Read-write**, the same permission that pauses, restarts or deletes the project. Every tool that changes Auth settings uses that endpoint, so there was no narrower token to give the workflow.

Supabase's own GitHub integration does the same deploy on every push to the production branch, on all plans: new migrations, the Edge Functions and Storage buckets declared in `config.toml`, and the `[auth]`, `[api]`, `[db]` and `[storage]` settings when a `[remotes]` block names the project, as `[remotes.production]` does.

## Decision

The integration deploys the Hub: connected to this repository, working directory the repository root, production branch `main`, **Deploy to production** on. `hub-deploy.yml` is gone, along with its secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) and variable (`SUPABASE_PROJECT_ID`).

## Consequences

- No credential in GitHub can change or delete the Hub.
- It deploys as soon as a commit reaches `main`: it doesn't wait for the Hub checks (`hub.yml`) to pass there. Those checks run on every pull request that touches the Hub, but aren't a required check (they only run when the Hub changes), so a red one has to stop the merge by hand.
- Its logs are in the Supabase dashboard (Branches), not in GitHub Actions.
- The Edge Functions import `packages/protocol` from outside `supabase/`. If the integration can't build them, we put a functions-only workflow back, whose token needs nothing more than Edge Functions: Read-write.

---
title: "0011 — Team members change through one function; devices follow membership"
description: "Studio adds, removes and promotes a team's members only through the team Edge Function, and a device belongs to a membership, so removing someone removes their devices on that team."
sidebar:
  order: 12
---

**A team's members change only through the `team` Edge Function, never through row level security. A device is part of a membership: removing someone from a team removes their devices on it.**

Status: accepted, 2026-10-29

## Context

Staff were added from the Supabase dashboard and the SQL editor, two steps only a developer could take. [Owners](/docs/start-here/glossary/) are meant to manage their team, and [platform admins](/docs/start-here/glossary/) every team.

Two facts shaped how:

- Adding someone needs a login, which only Auth's admin API makes, with the service role. A team's list needs its members' addresses (in Auth) and their devices, which no member may read.
- A device (`push_subscription`) carried a team and a user, but nothing tied the two to a membership. Someone taken out of a team with SQL kept their devices, and `notify` kept sending them the team's alerts.

## Decision

- **One function writes memberships.** `team` (`list`, `add`, `remove`, `set-role`) checks the caller with the service role and holds every rule in its handler: members read, owners and platform admins change, nobody removes or demotes themselves, a booth's login never joins a team. `authenticated` keeps no write grant on `org_member`.
- **Adding makes a login and sends nothing.** Studio offers a message to share; the person's first email is the sign-in code they ask for.
- **Devices follow membership.** `push_subscription (org_id, user_id)` references `org_member` with `on delete cascade`. The migration first removes devices whose owner is no longer in the team.

### Not chosen

- **Row level security policies for owners on `org_member`.** They'd cover remove and set-role, but not add (a login) nor the list (addresses, others' devices). The rules would then live in two places.
- **Supabase's invite email.** Its link opens Safari, not Studio on the Home Screen, which has its own session on an iPhone; and the Hub's mailer sends a couple of emails an hour.
- **Deleting the login on removal.** The person may be in another team, and a deleted account can't come back.

## Consequences

- Taking someone out of a team stops their alerts at once, even when done from the SQL editor.
- A new team rule is a change to `team/handler.ts` and its tests, not a policy.
- The function reads every Auth user to find one by address. Past about a thousand users, that wants a SQL lookup instead.

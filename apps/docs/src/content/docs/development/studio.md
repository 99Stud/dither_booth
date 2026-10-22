---
title: Studio
description: The staff app that gets the booths' alerts, how it signs staff in, and how it is set up and deployed.
sidebar:
  order: 8
---

Studio (`apps/studio`) is the staff app: a static site on Cloudflare Pages that staff add to their Home Screen. For now it signs them in and sets their [device](/docs/start-here/glossary/) up to get the booths' alerts; the alerts list comes next.

## Run it locally

```bash
bun run studio:dev   # http://localhost:5180, against the production Hub
```

To use the local Hub instead, give it the local values (`supabase status`) and the VAPID public key from `supabase/functions/.env`:

```bash
BUN_PUBLIC_HUB_URL=http://127.0.0.1:56321 \
BUN_PUBLIC_HUB_PUBLISHABLE_KEY=<ANON_KEY> \
BUN_PUBLIC_VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY> \
bun run studio:dev
```

`localhost` counts as a secure origin, so the service worker and push work there in Chrome, Edge and Firefox. Safari only pushes to a Home Screen app, so an iPhone or iPad needs the deployed Studio. `bun run dev` (the booth) doesn't start Studio.

## How it works

- **Sign-in with a code.** Staff type their address, get a 6-digit code by email, and type it in Studio. A link would open Safari, not the Home Screen app, and the two don't share a session on an iPhone. Only addresses already on the Hub can sign in (`shouldCreateUser: false`, and sign-up is off).
- **The device card** walks a device through what it needs: on an iPhone or iPad, add Studio to the Home Screen first; then _Turn on notifications_ (the permission prompt only shows in answer to a tap); then _Send test notification_ (the `send-test` function) and _Turn off_. A staff member who isn't in an org yet is told so.
- **The service worker** (`src/sw`, built to `/sw.js`) shows each push. Pushes for one alert share a tag, so a reminder or "back to normal" replaces the notification already there; if two arrive out of order, it keeps the newer one, by the push's `at`. A tap opens Studio.
- **The Hub it talks to** is built in: production by default, `BUN_PUBLIC_HUB_URL`, `BUN_PUBLIC_HUB_PUBLISHABLE_KEY` and `BUN_PUBLIC_VAPID_PUBLIC_KEY` otherwise. All three are public.

## Deploy

`.github/workflows/studio-deploy.yml` tests, builds and deploys Studio to Cloudflare Pages when `apps/studio`, `packages/ui` or `packages/protocol` changes on `main`, or by hand. It needs, in the `production` environment, the secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit, on this account only) and `CLOUDFLARE_ACCOUNT_ID`, and the variable `CLOUDFLARE_PAGES_PROJECT`.

## Setting it up on the Hub

Once per project:

1. **The sign-in email** (Authentication, Emails, Magic Link): subject _Your Studio code_, and a body that shows `{{ .Token }}`, as `supabase/templates/magic_link.html` does locally.
2. **Push**: the VAPID keys and `notify` set up as in [The Hub](/docs/development/hub/).

## Adding staff

There is no sign-up. For each staff member:

1. Authentication, Users, _Add user_, with their address (no password needed).
2. Add them to the org, in the SQL editor:

   ```sql
   insert into public.org_member (org_id, user_id)
   select o.id, u.id from public.org o, auth.users u
   where o.name = '99Stud' and u.email = '<their address>';
   ```

They then open Studio, sign in with the emailed code, and turn notifications on, on each device.

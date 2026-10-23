---
title: Studio
description: The staff app that gets the booths' alerts, how it signs staff in, and how it is set up and deployed.
sidebar:
  order: 8
---

Studio (`apps/studio`) is the staff app: a static site on Cloudflare Pages that staff add to their Home Screen. It has three tabs: **Alerts**, **Booths** and **This device**, which sets a [device](/docs/start-here/glossary/) up to get the booths' alerts.

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

- **Sign-in with a code.** Staff type their address, get a 6-digit code by email, and type it in Studio; the last digit signs them in, and iOS offers the code from Mail above the keyboard. A link would open Safari, not the Home Screen app, and the two don't share a session on an iPhone. Only addresses already on the Hub can sign in (`shouldCreateUser: false`, and sign-up is off).
- **The device card** walks a device through what it needs: on an iPhone or iPad, add Studio to the Home Screen first; then _Turn on notifications_ (the permission prompt only shows in answer to a tap); then _Send test notification_ (the `send-test` function) and _Turn off_. A staff member who isn't in an org yet is told so.
- **Alerts** (`/alerts`) lists what is open now, critical first, then what closed in the last 24 hours. **Acknowledge** stops an alert's reminders; if the Hub changed nothing (the alert isn't the staff member's to acknowledge), Studio says so instead of claiming it worked. The tab shows how many are open. Closed alerts older than a day aren't shown: Studio is for what needs someone now.
- **Booths** (`/booths`) shows each booth's last report, its printer and maintenance state, and its [event times](/docs/start-here/glossary/), which staff set there. **Add a booth** creates one in the staff member's org, and **Get a registration code** issues its code (the `booth-code` function), to type in the booth's admin.
- **The banner.** On Booths and This device, the most urgent alert nobody acknowledged yet sits above the screen, and a tap opens it. A push can be muted by Focus; the banner can't.
- **Live.** Both screens and the banner read again when the Hub's Realtime says `alert` or `booth_status` changed, when Studio comes back to the foreground (iOS drops the socket in the background), and every minute.
- **The service worker** (`src/sw`, built to `/sw.js`) shows each push. Pushes for one alert share a tag, so a reminder or "back to normal" replaces the notification already there; if two arrive out of order, it keeps the newer one, by the push's `at`. A tap opens Studio on that alert (`/alerts/<id>`).
- **The sign-in email** (`supabase/templates/magic_link.html`) puts the code first: in the subject (_123456 is your Studio code_), so the notification alone is enough, then large in the body, with how long it lasts and what to do if you didn't ask for it. It loads its two images from Studio (`{{ .SiteURL }}/email/`), PNGs because mail apps block SVG. Locally, `site_url` is Studio's dev server, so the local Hub's mail viewer shows them while `studio:dev` runs.
- **The icons** come from the Dither Booth mark in `packages/ui/src/lib/brand.tsx`: run `bun run --filter @dither-booth/ui brand` after changing it, and commit what it writes (Studio's, Shutter's and admin's Home Screen icons, the docs' favicon and logos, the email's images). The browser-tab icon is drawn from the same mark at runtime.
- **Powered by 99Stud** sits under the sign-in screen and at the foot of the sign-in email.
- **The Hub it talks to** is built in: production by default, `BUN_PUBLIC_HUB_URL`, `BUN_PUBLIC_HUB_PUBLISHABLE_KEY` and `BUN_PUBLIC_VAPID_PUBLIC_KEY` otherwise. All three are public.

## Deploy

`.github/workflows/studio-deploy.yml` tests, builds and deploys Studio to Cloudflare Pages when `apps/studio`, `packages/ui` or `packages/protocol` changes on `main`, or by hand. It needs, in the `production` environment, the secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit, on this account only) and `CLOUDFLARE_ACCOUNT_ID`, and the variable `CLOUDFLARE_PAGES_PROJECT`.

## Setting it up on the Hub

Once per project:

1. **Push**: the VAPID keys and `notify` set up as in [The Hub](/docs/development/hub/).

The sign-in email needs no setup: the Hub deploy pushes it (see [Production settings come from `config.toml`](/docs/development/hub/#production-settings-come-from-configtoml)). The access token the deploy uses needs, for that step, Read-write on Auth Config and Read on Data API Config, Database Config and Storage Config.

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

---
title: Studio
description: The staff app that gets the booths' alerts, how it signs staff in, and how it is set up and deployed.
sidebar:
  order: 9
---

Studio (`apps/studio`) is the staff app: a static site on Cloudflare Pages, at `https://studio.ditherbooth.com`, that staff add to their Home Screen. It has five tabs: **Alerts**, **Booths**, **Events**, **Team** and **This device**, which sets a [device](/docs/start-here/glossary/) up to get the booths' alerts.

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
- **The device card** says first, when it applies, **You're on call** for the soonest event on now or to come, and to turn on notifications if they're off. Then it walks a device through what it needs: on an iPhone or iPad, add Studio to the Home Screen first; then _Turn on notifications_ (the permission prompt only shows in answer to a tap); then _Send test notification_ (the `send-test` function) and _Turn off_. A staff member who isn't in an org yet is told so.
- **Alerts** (`/alerts`) lists what is open now, critical first, then what closed in the last 24 hours. **Acknowledge** stops an alert's reminders; if the Hub changed nothing (the alert isn't the staff member's to acknowledge), Studio says so instead of claiming it worked. The tab shows how many are open. Closed alerts older than a day aren't shown: Studio is for what needs someone now.
- **Booths** (`/booths`) shows each booth's last report, its printer and maintenance state, and its [event times](/docs/start-here/glossary/), which staff set there. **Add a booth** creates one in the staff member's org, and **Get a registration code** issues its code (the `booth-code` function), to type in the booth's admin. Each registered booth shows the release it runs, **Behind: 0.8.0 is out** when GitHub's latest release is newer (read from `api.github.com` once per screen), and **Update to 0.8.0**, which asks the booth to install it (a `booth_update` row) after a confirm. How the request goes follows under it, from the booth's own reports: asked, waiting (and why), updating, updated, stopped, or gone back. **Cancel the update** removes a request the booth hasn't started. With two or more booths behind, **Update all behind** asks each at once. An update that stops or goes back is an **Update failed** alert, with the booth's reason under it.
- **Events** (`/events`) lists the [events](/docs/start-here/glossary/) the staff member sees, under **On now**, **Coming up** and **Past** (the last 10): name, window, booth and client, and on the booth team's side who gets its alerts (_3 on call_ or _Whole team_). Platform admins get **Book an event**: a name, a client team, a booth and the window. Before saving, Studio looks for an event already on the booth then and names it (_Booth A already has Halloween then_); the Hub's exclusion constraint stays the backstop for a booking made in between. Words for every refusal live in `lib/events.ts`, Postgres codes read through `postgresCode` in `lib/errors.ts`.
- **An event** (`/events/<id>`) shows its window, booth and client. Platform admins **Change** it (name, booth, window; the client stays) and **Cancel event** (after a confirm). Under it, for the booth's team and admins, **On call**: the booth's team, each with a switch and whether their phone will ring (Team's line; someone on call without a device reads, in amber, _No device yet: won't get alerts until they turn on notifications_). A switch saves on its own (one insert or delete on `event_on_call`), stays as flipped until the saved list is read back, and goes back with a toast if the Hub refuses. With nobody else in the team, it says so and offers **Open Team**. The line under the title says who gets the alerts, so the fallback is never a surprise: _Nobody on call: the whole team gets Booth A's alerts_, _They get Booth A's alerts during Halloween_, or, in amber, _None of them has a device yet, so the whole team gets the alerts_. It reads the `on-call` function ([The Hub](/docs/development/hub/#the-on-call-function)). Its badge says whom the alerts reach: _2 on call_, or _Whole team_ when nobody on call has a device. In the Events list the badge counts who is on call, since a list reader can't see others' devices. Staff who aren't admins see the switches disabled.
- **Team** (`/team`) lists the team's members, the staff member first, then owners, each with whether their phone will ring: _2 devices_, _No device yet: won't get alerts_, or _Hasn't signed in yet_. Above them, how many are in and how many get alerts. Owners and platform admins also get **Add someone** and, on each other member, **Share sign-in**, **Make owner** or **Make member**, and **Remove from team** (after a confirm). A platform admin who sees several teams picks one at the top, and starts a team (a client's) with **New team**. Everything goes through the `team` function ([The Hub](/docs/development/hub/#the-team-function)).
- **The banner.** On every tab but Alerts, the most urgent alert nobody acknowledged yet sits above the screen, and a tap opens it. A push can be muted by Focus; the banner can't.
- **Live.** Alerts, Booths and the banner read again when the Hub's Realtime says `alert`, `booth_status` or `booth_update` changed; Events, an event and **You're on call** when `event` or `event_on_call` did. Every screen also reads again when Studio comes back to the foreground (iOS drops the socket in the background), and every minute. Team has no Realtime: a member can't read the rest of the team's rows, so it would only hear about their own. It reads again after each change made there.
- **The service worker** (`src/sw`, built to `/sw.js`) shows each push. Pushes for one alert share a tag, so a reminder or "back to normal" replaces the notification already there; if two arrive out of order, it keeps the newer one, by the push's `at`. A tap opens Studio on that alert (`/alerts/<id>`).
- **The sign-in email** (`supabase/templates/magic_link.html`) puts the code first: in the subject (_123456 is your Studio code_), so the notification alone is enough, then large in the body, with how long it lasts and what to do if you didn't ask for it. It loads its two images from Studio (`{{ .SiteURL }}/email/`), PNGs because mail apps block SVG. Locally, `site_url` is Studio's dev server, so the local Hub's mail viewer shows them while `studio:dev` runs.
- **The icons** come from the Dither Booth mark in `packages/ui/src/lib/brand.tsx`: run `bun run --filter @dither-booth/ui brand` after changing it, and commit what it writes (Studio's, Shutter's and admin's Home Screen icons, the docs' favicon and logos, the email's images). The browser-tab icon is drawn from the same mark at runtime.
- **The splash** (`src/app/Splash.tsx`, see the [glossary](/docs/start-here/glossary/)) covers Studio while it finds its session: the white mark on the app icon's background (`BRAND_ICON_BACKGROUND`, the manifest's `background_color`), in either theme, so it carries on from the launch screen. `index.html` paints that background before the app loads, so the screen stays dark between the two. The ghost steps up into place (360 ms, in 3 steps), then from halfway through it the 14 dither pixels drop in one by one, in random order (320 ms each, 45 ms apart), with anime.js. Once the entrance is over (about 1.1 s) and the session is known, the splash fades out (280 ms). It waits for the session 3 s at most after the entrance, then fades anyway onto the app's own spinner. With reduced motion it shows still and goes as soon as the session is known. A page hidden during the entrance or the fade jumps to its end, as animation frames stop there. While it shows, the app under it is `inert`, and screen readers hear "Loading Studio". The launch screen can't move, so the animation has to be part of the app.
- **Powered by 99Stud** sits under the sign-in screen and at the foot of the sign-in email.
- **The Hub it talks to** is built in: production by default, `BUN_PUBLIC_HUB_URL`, `BUN_PUBLIC_HUB_PUBLISHABLE_KEY` and `BUN_PUBLIC_VAPID_PUBLIC_KEY` otherwise. All three are public.

## Deploy

`.github/workflows/studio-deploy.yml` tests, builds and deploys Studio to Cloudflare Pages when `apps/studio`, `packages/ui` or `packages/protocol` changes on `main`, or by hand. It needs, in the `production` environment, the secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit, on this account only) and `CLOUDFLARE_ACCOUNT_ID`, and the variable `CLOUDFLARE_PAGES_PROJECT`.

### Its address

`studio.ditherbooth.com` is a custom domain on the Pages project (Workers & Pages, the project, **Custom domains**). The `ditherbooth.com` zone is on the same Cloudflare account, so adding the domain there creates its DNS record and certificate. The project's own `dither-studio.pages.dev` serves the same build and stays up.

The Hub's production `site_url` names this address: the sign-in email loads its images from it. Add a new address to Pages, and wait for it to show **Active**, before the `site_url` change reaches `main`; otherwise the email's images break.

A device belongs to one address. The Home Screen app, the sign-in and the notifications on `dither-studio.pages.dev` don't carry over to `studio.ditherbooth.com`: on each device, add the new address to the Home Screen, sign in, and turn notifications on again, then delete the old Home Screen app. Once the push service says its subscription is gone, the Hub forgets it, as for any device.

## Setting it up on the Hub

Once per project:

1. **Push**: the VAPID keys and `notify` set up as in [The Hub](/docs/development/hub/).

The sign-in email needs no setup: every Hub deploy applies it (see [Production settings come from `config.toml`](/docs/development/hub/#production-settings-come-from-configtoml)).

## Adding staff

There is no sign-up: an owner or a platform admin adds people in Studio's **Team**, as [Your team in Studio](/docs/venue/team/) says. Adding someone makes their login and sends no email; the message Studio offers to share tells them how to sign in.

### Without Studio

A brand-new Hub has nobody to add the first people. Make yourself a platform admin in the SQL editor, after adding your login (Authentication, Users, _Add user_, no password needed):

```sql
insert into public.platform_admin (user_id)
select id from auth.users where email = '<their address>';
```

A platform admin sees every team's booths and alerts in Studio, and manages every team's members. To get a team's alerts, or to add booths, they add themselves to it in **Team**.

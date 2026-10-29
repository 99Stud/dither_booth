---
title: Studio
description: The staff app that gets the booths' alerts, how it signs staff in, and how it is set up and deployed.
sidebar:
  order: 9
---

Studio (`apps/studio`) is the staff app: a static site on Cloudflare Pages, at `https://studio.ditherbooth.com`, that staff add to their Home Screen. It has four tabs: **Alerts**, **Booths**, **Team** and **This device**, which sets a [device](/docs/start-here/glossary/) up to get the booths' alerts.

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
- **Booths** (`/booths`) shows each booth's last report, its printer and maintenance state, and its [event times](/docs/start-here/glossary/), which staff set there. **Add a booth** creates one in the staff member's org, and **Get a registration code** issues its code (the `booth-code` function), to type in the booth's admin. Each registered booth shows the release it runs, **Behind: 0.8.0 is out** when GitHub's latest release is newer (read from `api.github.com` once per screen), and **Update to 0.8.0**, which asks the booth to install it (a `booth_update` row) after a confirm. How the request goes follows under it, from the booth's own reports: asked, waiting (and why), updating, updated, stopped, or gone back. **Cancel the update** removes a request the booth hasn't started. With two or more booths behind, **Update all behind** asks each at once. An update that stops or goes back is an **Update failed** alert, with the booth's reason under it.
- **Team** (`/team`) lists the team's members, the staff member first, then owners, each with whether their phone will ring: _2 devices_, _No device yet: won't get alerts_, or _Hasn't signed in yet_. Above them, how many are in and how many get alerts. Owners and platform admins also get **Add someone** and, on each other member, **Share sign-in**, **Make owner** or **Make member**, and **Remove from team** (after a confirm). A platform admin who sees several teams picks one at the top. Everything goes through the `team` function ([The Hub](/docs/development/hub/#the-team-function)).
- **The banner.** On Booths, Team and This device, the most urgent alert nobody acknowledged yet sits above the screen, and a tap opens it. A push can be muted by Focus; the banner can't.
- **Live.** The screens and the banner read again when the Hub's Realtime says `alert`, `booth_status` or `booth_update` changed, when Studio comes back to the foreground (iOS drops the socket in the background), and every minute.
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

There is no sign-up: an owner or a platform admin adds people in Studio.

1. Open **Team** and, under **Add someone**, type their address. Pick **Member**, or **Owner** for someone who should also add and remove people. Choose **Add**.
2. Choose **Share** (or **Copy message**) and send them the message. It tells them to open Studio, sign in with that address and the code they're emailed, and turn on notifications in **This device**. No email goes out until they ask for their code.

Their row reads _Hasn't signed in yet_ until they do, then _No device yet_ until their phone gets alerts. **Share sign-in** in their row's menu sends the message again. **Remove from team** takes them out: their devices stop getting the team's alerts and they no longer see its booths, but their login stays.

Nobody removes or demotes themselves; ask another owner or a platform admin.

### Without Studio

A brand-new Hub has nobody to add the first people. Make yourself a platform admin in the SQL editor, after adding your login (Authentication, Users, _Add user_, no password needed):

```sql
insert into public.platform_admin (user_id)
select id from auth.users where email = '<their address>';
```

A platform admin sees every team's booths and alerts in Studio, and manages every team's members. To get a team's alerts, or to add booths, they add themselves to it in **Team**.

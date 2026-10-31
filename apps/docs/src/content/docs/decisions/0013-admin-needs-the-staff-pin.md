---
title: "0013 — Admin needs the staff PIN"
description: "Admin was open to anyone who could load it. The booth's tickets lead there, so admin and the captive page now ask for the one staff PIN, the Darkroom's, set first from the CLI."
sidebar:
  order: 14
---

**Admin and the captive page ask for the staff PIN, the same PIN that opens the Darkroom. Admin keeps the token in an HttpOnly cookie. The first PIN can only be set on the booth, with `booth pin`.**

Status: accepted, 2026-10-31

## Context

Admin trusted the network: the engine let in any request whose `Origin` was admin's own. Two things broke that:

- **The tickets.** When the network fails, the booth prints a setup or Wi-Fi ticket, on the printer guests take their tickets from. Both lead to the setup page, which links to admin, and the Wi-Fi ticket prints the booth Wi-Fi's password. A guest who picks one up reaches admin, and on the booth Wi-Fi, the captive page that moves the booth to another network.
- **`Origin` proves nothing outside a browser.** `curl` sends any `Origin`, through either web server's proxy. So the check kept other sites' pages out, never people.

## Decision

- **One staff PIN** opens admin and the Darkroom: the existing Darkroom PIN, with its argon2id hash and in-memory tokens. An admin call needs the admin origin **and** a live token.
- **Admin's token lives in a cookie** (`dither_staff`, HttpOnly, Secure, SameSite=Strict), set by the admin server's `/admin/session`. The admin server's proxy turns it into the engine's header, and its own routes (logs, system, power, updates) check it. While the engine is down, those routes trust a token it confirmed in the last 30 minutes, so the logs and restarts stay reachable.
- **The first PIN comes from `booth pin`**, on the booth. Admin stays locked until one exists. `booth install` asks for it; `booth doctor` fails without it.
- **The captive page asks for the PIN** before it joins a network.
- **Wrong PINs pause longer each time**: 60 s after five, then doubling up to 15 minutes, since a 4-digit PIN now guards admin.

### Not chosen

- **A separate admin PIN.** Clearer roles, but staff on site would carry two PINs, and the Darkroom already changes the booth's Wi-Fi.
- **The first admin visit sets the PIN.** No SSH needed, but whoever opens admin first, a guest with a ticket included, would pick it.
- **Hide the admin link, stop printing the Wi-Fi password.** It makes admin harder to find, not closed. Staff still need the ticket to join the booth Wi-Fi.
- **The token in `localStorage`, like the Darkroom's.** Every admin fetch and socket would have to carry it, and any script on the page could read it. A cookie goes with the socket upgrade on its own.

## Consequences

- Anyone with the PIN can do everything admin can. The Darkroom on the iPad still opens only its own procedures, because its origin isn't admin's. A token used outside a browser can forge the origin.
- A booth that updates with a Darkroom PIN is protected straight away, with that PIN. A booth without one has admin locked until someone runs `sudo booth pin` over SSH.
- Changing the PIN, restarting the engine, or 30 idle minutes signs admin out. An open admin tab polls, so it stays signed in.
- Nobody can sign in to admin while the engine is down. Recovery then goes through SSH.

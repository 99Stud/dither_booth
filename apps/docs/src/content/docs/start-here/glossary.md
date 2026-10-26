---
title: Glossary
description: The words the booth, its staff and the code use for the same things.
sidebar:
  order: 2
---

One word per idea, used the same way on screen, in these docs and in the code. When a term has an _avoid_ list, don't use those words in anything staff read.

## The apps

**Shutter**: the guest-facing web app on the iPad (`https://<booth>:3000`). Its routes are the Experience (`/`), the Darkroom (`/darkroom`) and the receipt viewer (`/receipt-viewer`, only for the engine's Chromium).

**Experience**: the guest flow inside the Shutter: landing screen, countdown, photo, slot machine (only when the lottery is on), print.

**Darkroom**: the staff screen inside the Shutter, behind a PIN, for print tuning, sample tickets, Wi-Fi and printer status. Opened by tapping the logo four times within two seconds.

**Admin**: the staff web app (`https://<booth>:3002`): Control Center, Event, Settings.

**Studio**: the staff app, on staff phones and computers, outside the booth: it gets the booths' alerts, shows how each booth is doing, sets their event times and gives their registration codes. It talks to the Hub, never to a booth.

**Engine**: the backend process. It is only reachable through the two web apps, which proxy `/engine/trpc` to it over loopback.

## Kits

**Kit**: the look of an event, on the booth screen and on paper: its text, fonts, background, camera screen and tickets. Each event picks one (`campaign.kit_id`). A kit ships with the release, so a new kit needs a release, not a database change.

**Kit settings**: what an event changes on its kit, stored on the event. Only the changes are kept, so a kit's new defaults reach every event that didn't touch them.

**Copy**: every piece of text a kit shows, each under a key (`landing.poweredBy`). All kits share the same keys, so an event's edits survive a change of kit. `**text**` renders bold.

**Font role**: where a typeface is used: **display**, **body** or **mono**. A kit picks a font for each role and an event can swap any of them.

**Bundled font**: a font that ships with the Shutter, so it works offline.

**Font library**: Google Fonts, through Fontsource. Staff install a font from it in admin; the booth downloads it once and keeps it on its SSD.

**Font asset**: a font added to this booth, from the font library or a woff2 file staff upload. An event can't remove one it uses.

**Background**: the shader behind the booth screen (_fluid_ or _smoke_).

**Background preset**: a background's values as data, for one kit. Staff don't see raw values; they move **controls** (worded 0–100 sliders and switches) or pick a **look** (a saved set of control values).

**Camera screen**: the CRT effect over the camera square: lines and sweep, and a colour wash.

**Kit preview**: admin's live preview of a kit draft. It frames the Shutter's own screens and tickets, with sample data, and never touches the camera, the lottery or the printer.

## Events and lottery

**Event** (_campaign_ in the code): one booking of the booth. Exactly one is active at a time. Replacing an event archives the old one; events are never deleted.

**Lottery**: the event's prize draw, run once per visit. It has odds, a cooldown between wins and an on/off switch.

**Prize**: something a ticket can win, with a rarity and a stock.

**Draw**: one lottery result, win or loss, recorded with its ticket reference.

**Ticket ref**: the six-digit reference printed on a receipt (`000001`–`999999`), unique across all events. `000000` is reserved for admin test prints, which never draw.

## Booth state

**Maintenance**: the booth is closed to guests. They see “be right back” and can't start a visit, while the Darkroom still opens. A visit already under way finishes first.
_Avoid_: pause, offline, down.

**Maintenance reason**: why the booth is in maintenance: **manual**, **printer**, or both. The booth stays in maintenance while any reason holds.

**Manual maintenance**: maintenance staff switched on in admin. Only staff end it; a fixed printer never does.

**Automatic maintenance**: the switch that lets a printer that can't print put the booth in maintenance, and take it out once fixed. On unless staff turn it off.

## Printer

**Printer status**: what the receipt printer reports, as staff read it: its conditions, whether it can print, and since when.

**Printer condition**: one thing wrong with the printer: paper low, out of paper, cover open, printer error, not connected, or checking (no status yet). Paper low is a warning: the printer still prints.

**Printer watch**: the engine keeping the printer connected and listening to its status for as long as it runs.
_Avoid_: watchdog (in staff-facing text).

## The cloud

**Hub**: the cloud side (Supabase, in the EU) that booths report to and staff are alerted from. The booth never depends on it to run an event.

**Heartbeat**: what a booth tells the Hub every 30 seconds: its release, its printer's conditions and its maintenance state. It carries the booth's state, not events, so repeating one is harmless. The Hub opens an alert when it changes for the worse and closes it when it clears.

**Alert**: something staff must act on, opened by the Hub from a heartbeat: out of paper, a printer error or unplugged, paper low, the cover open, or a silent booth. It closes by itself when the condition clears, and staff can acknowledge it meanwhile.

**Device**: a staff phone, iPad or computer that gets alerts as push notifications, once its owner turned them on in the Studio app (`push_subscription` in the code). A device the push service says is gone is forgotten.
_Avoid_: subscription (in staff-facing text).

**Reminder**: an alert pushed again: a critical alert still open and not acknowledged is pushed every 10 minutes.

**Acknowledge**: what staff do in the Studio app to say "I'm on it". It stops the reminders; the alert still closes by itself when the condition clears.
_Avoid_: dismiss, mute.

**Event times**: when a booth's event starts and ends, set in the Studio app (`live_from`, `live_until` in the code). Only then is a silent booth an alert.
_Avoid_: live window (in staff-facing text).

**Silent booth**: a booth that has sent no heartbeat for three minutes between its event times. Only the Hub can notice it, since a booth that lost power or its network can't say so.
_Avoid_: offline, down (in staff-facing text).

**Hub registration**: the booth's own identity on the Hub, made once with a registration code from admin's **Settings → Hub**. A registered booth reports to the Hub; **forgetting the registration** stops that, on the booth only.
_Avoid_: link, connect, pair (in staff-facing text).

**Registration code**: the one-time code staff get in the Studio app (Booths) and type in admin's Settings, so a booth gets its own identity there. Ten letters and digits (`7KQ2M-9XD4T`), valid 24 hours, works once.

**Dry run**: a booth that runs without printing for real, for development. It never raises an alert.

## Connecting devices

**Setup page**: the plain-HTTP page (port `3003`) where a device trusts the booth once, then opens the Shutter. It knows whether the device already trusts the booth.

**Setup ticket**: what the printer prints at power-on and on a new network: a QR to the setup page and the booth's address.

**Booth Wi-Fi**: the booth's own Wi-Fi network (`DitherBooth-XXXX`). It opens when no saved network is around, or when staff choose to run the event on it.
_Avoid_: hotspot, access point (in staff-facing text).

**Wi-Fi ticket**: what the printer prints when the booth Wi-Fi opens: a QR to join it and a QR to the setup page.

**Captive page**: the Wi-Fi picker a phone, iPad or laptop shows on its own when it joins the booth Wi-Fi while the booth waits for a network, the way hotel Wi-Fi shows its login page. Staff pick the venue's network there. It never needs the Darkroom PIN, and it's gone once the booth has a network or staff run the event on the booth Wi-Fi.
_Avoid_: captive portal, login page (in staff-facing text).

**Booth CA**: the booth's own certificate authority (mkcert). A device trusts it once; after that, every certificate the booth issues for a new address is trusted too.

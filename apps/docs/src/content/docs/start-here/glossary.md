---
title: Glossary
description: The words the booth, its staff and the code use for the same things.
sidebar:
  order: 2
---

One word per idea, used the same way on screen, in these docs and in the code. When a term has an _avoid_ list, don't use those words in anything staff read.

## The apps

**Shutter**: the guest-facing web app on the iPad (`https://<booth>:3000`). Its routes are the Experience (`/`), the Darkroom (`/darkroom`) and the receipt viewer (`/receipt-viewer`, only for the engine's Chromium).

**Experience**: the guest flow inside the Shutter: landing screen, countdown, photo, slot machine, print.

**Darkroom**: the staff screen inside the Shutter, behind a PIN, for print tuning, sample tickets, Wi-Fi and printer status. Opened by tapping the logo four times within two seconds.

**Admin**: the staff web app (`https://<booth>:3002`): Control Center, Event, Settings.

**Engine**: the backend process. It is only reachable through the two web apps, which proxy `/engine/trpc` to it over loopback.

**Kit**: the look of an event's photo receipt. Each event picks one (`campaign.kit_id`).

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

## Connecting devices

**Setup page**: the plain-HTTP page (port `3003`) where a device trusts the booth once, then opens the Shutter. It knows whether the device already trusts the booth.

**Setup ticket**: what the printer prints at power-on and on a new network: a QR to the setup page and the booth's address.

**Booth Wi-Fi**: the booth's own Wi-Fi network (`DitherBooth-XXXX`). It opens when no saved network is around, or when staff choose to run the event on it.
_Avoid_: hotspot, access point (in staff-facing text).

**Wi-Fi ticket**: what the printer prints when the booth Wi-Fi opens: a QR to join it and a QR to the setup page.

**Captive page**: the Wi-Fi picker a phone, iPad or laptop shows on its own when it joins the booth Wi-Fi while the booth waits for a network, the way hotel Wi-Fi shows its login page. Staff pick the venue's network there. It never needs the Darkroom PIN, and it's gone once the booth has a network or staff run the event on the booth Wi-Fi.
_Avoid_: captive portal, login page (in staff-facing text).

**Booth CA**: the booth's own certificate authority (mkcert). A device trusts it once; after that, every certificate the booth issues for a new address is trusted too.

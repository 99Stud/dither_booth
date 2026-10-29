---
title: Glossary
description: The words the booth, its staff and the code use for the same things.
sidebar:
  order: 2
---

One word per idea, used the same way on screen, in these docs and in the code. When a term has an _avoid_ list, don't use those words in anything staff read.

## The apps

**Shutter**: the guest-facing web app on the iPad (`https://<booth>:3000`). Its routes are the Experience (`/`), the Darkroom (`/darkroom`), the receipt viewer (`/receipt-viewer`, only for the engine's Chromium) and the kit preview (`/preview`, only inside admin).

**Experience**: the guest flow inside the Shutter: landing screen, countdown, photo, slot machine (only when the lottery is on), print.

**Darkroom**: the staff screen inside the Shutter, behind a PIN, for print tuning, sample tickets, Wi-Fi and printer status. Opened by tapping the logo four times within two seconds.

**Admin**: the staff web app (`https://<booth>:3002`): Control Center, Event, Settings, and the Logs and System pages for tech staff.

**Studio**: the staff app, on staff phones and computers, outside the booth: it gets the booths' alerts, shows how each booth is doing, sets their event times and gives their registration codes. It talks to the Hub, never to a booth.
_Avoid_: Studio for Supabase's own dashboard (call that the Supabase dashboard).

**Engine**: the backend process. It is only reachable through the two web apps, which proxy `/engine/trpc` to it over loopback.

## Kits

**Kit**: the look of an event, on the booth screen and on paper: its text, fonts, background, camera screen and tickets. Each event picks one (`campaign.kit_id`). A kit ships with the release, so a new kit needs a release, not a database change.

**Kit settings**: what an event changes on its kit, stored on the event. Only the changes are kept, so a kit's new defaults reach every event that didn't touch them.

**Copy**: every piece of text a kit shows, each under a key (`landing.poweredBy`). All kits share the same keys, so an event's edits survive a change of kit. `**text**` renders bold.

**Font role**: where a typeface is used: **display**, **body** or **mono**. A kit picks a font for each role and an event can swap any of them.

**Bundled font**: a font that ships with the Shutter, so it works offline.

**Font library**: Google Fonts, through Fontsource. Staff install a font from it in admin; the booth downloads it once and keeps it on its SSD.

**Font asset**: a font added to this booth, from the font library or a woff2 file staff upload. An event can't remove one it uses.

**Partners**: the logos an event prints on its photo receipt, in order, at most 4. They belong to the event, not the kit, so they stay when the kit changes or is reset.
_Avoid_: sponsors (the row also holds the operator's and the venue's logos).

**Partner row**: the row on the photo receipt that shows the partners. With none, it isn't printed.

**Logo asset**: a logo added to this booth: a PNG or SVG staff upload, kept in black and white as it prints. An event can't remove one it prints.

**Logo library**: the logos added to this booth, in admin's **Logo library** sheet. Staff upload logos there and pick an event's partners from it. Unlike the font library, it holds only what staff uploaded.

**Background**: what moves behind the booth screen: **Fluid ascii** or **Charcoal smoke**. A kit picks one; an event can switch to the other and move its controls.
_Avoid_: shader, effect (in staff-facing text).

**Background preset**: every raw value of one background, as data. Each background has a built-in preset, and a kit points at one. Staff never see raw values.

**Kit look**: the background as the event's kit ships it: every slider in the middle, the kit's switches and colours. For a background the kit doesn't use, that background's built-in look. **Back to the kit's look** returns to it.

**Control**: one thing staff change on a background, in plain words: a 0–100 slider (50 is the kit look), a switch, or colours. Each moves several raw values at once, within limits that keep the iPad smooth.

**Look**: a named set of control values, picked in one click as a starting point (**Deep sea**, **Charcoal**, **Fog**…). The first is the kit look. Once a control moves, admin shows the look as edited.

**Swatch**: a named set of colours for a background's colours control (**Palette**, **Paper and ink**). Picking one changes only the colours. A look and a swatch can share a name: that look uses that swatch.

**Retro effects**: the background's four switches: **Ascii screen**, **Scanlines**, **Film grain** and **CRT curve**. They cover the whole background, never the camera screen.

**Camera screen**: the old-monitor effect over the live camera and the frozen photo: **CRT lines** (scanlines and a slow sweep) and a **Colour wash**, tinted to match the background or a custom colour. The printed photo never has it. Separate from the background's retro effects.

**Kit preview**: admin's live preview of a kit draft. It frames the Shutter's own screens and tickets, with sample data, and never touches the camera, the lottery or the printer.

## Events and lottery

**Event** (_campaign_ in the code): one booking of the booth. Exactly one is active at a time. Replacing an event archives the old one; events are never deleted.

**Visit**: one guest's go at the booth, from the Start tap to the cut tickets or to giving up. Every visit gets a ticket number and prints a photo receipt; it runs a draw only while the lottery is live. The booth records each one, and it ends **completed** (the receipt printed), **failed** (printing failed) or **abandoned** (the guest or the page left before the end). The Event page's Overview counts them as **Guests**: a guest who comes back counts twice.

**Start and end**: when an event begins and finishes, set by staff in admin's **Edit details**. Only guests who tap **Start** in between count in the Overview; visits outside are recorded but **uncounted** (setup tests, packing up). Either may stay empty. Not the same as Studio's **event times**.

**Time at the booth**: how long a completed visit lasts on average, from **Start** to the receipt, written "1 min 20 s".
_Avoid_: average visit, visit length (in staff-facing text).

**Walked away**: guests whose visit ended **abandoned**: they or the page left before the end.

**Needs a look**: the Overview's list of what staff should act on now (a ticket that didn't print, a booth problem, a prize running out). Staff only: a client never sees it.

**Lottery**: the event's prize draw, one per visit while it is live. It has its prizes, a no-win weight, a pause after a win and a switch.

**Live**: the lottery is switched on, so visits draw and guests see the prize panel and the slot machine. Off, visits still print their photo receipt.
_Avoid_: enabled, active (an event is active, a lottery is live).

**Draw**: one lottery result, win or loss, recorded with its visit's ticket number. A visit while the lottery is off is not a draw: admin's **Draws** list leaves it out, and the lookup shows it as **No lottery**.

**Prize**: something a draw can win, with a title, a rarity, a weight, a stock and **How to claim it** (printed on the winning lottery ticket).

**Rarity**: a prize's rank, **common**, **uncommon**, **rare**, **epic** or **legendary**. It sets the prize's default weight and how the win looks.

**Weight**: how much room a prize takes in the draw. It comes from the rarity unless set on the prize, and it doesn't change with stock left.

**No-win weight**: the weight of “no prize” in the draw. Higher means fewer winners. New events start at 50.

**Odds**: a prize's chance on one draw: its weight ÷ (the weights of every prize with stock left + the no-win weight). A prize that runs out leaves the draw, so the others' odds go up.

**Pause after a win**: minutes after any win during which every draw, for every guest, is a loss. `0` lets guests win back to back.
_Avoid_: cooldown (in staff-facing text).

**Stock**: how many units of a prize are left: everything added minus every win. Each win takes one unit at the draw; stock never goes below zero.

**Restock**: adding units to a prize's stock, or removing them with a negative number. Applied exactly once, even if the form retries.

**Delete prize**: takes a prize out of future draws. Draws that already won it keep its title.

**Loser ticket**: a lottery ticket for a loss, printed only when the lottery's **Print loser ticket** is on.

**Forced draw**: a draw whose outcome a development flag fixes (`LOTTERY_FORCE_OUTCOME`, `LOTTERY_FORCE_PRIZE_ID`). It skips the odds, the pause and the switch, never the stock. Never on a booth at an event.

**Ticket number** (`ticketRef` in the code): the six digits printed on a visit's photo receipt and lottery ticket (`000001`–`999999`), unique across all events. `000000` is reserved for test prints and sample lottery tickets, which never draw.
_Avoid_: ref, reference (in staff-facing text).

## Tickets

**Ticket**: any slip the printer prints and cuts. The word staff read for all of them.
_Avoid_: receipt (on its own, in staff-facing text).

**Photo receipt**: the ticket a guest visit prints first: the dithered photo in the event's kit, with its ticket items, partner row and ticket number.

**Lottery ticket**: the ticket that shows a draw's outcome, printed right after the photo receipt with the same ticket number: for a win, or a loser ticket for a loss.

**Test print**: a photo receipt printed from the Darkroom to check the print settings, with the ticket number `000000`. It never draws.

**Sample lottery ticket**: a lottery ticket for a chosen prize, or a loss, printed from the Darkroom or admin's **Settings → Printing**, with the ticket number `000000`. It never touches the lottery.

**Print settings**: how this booth's printer turns a photo into black dots: dither mode, exposure, threshold and the rest. Device tuning, set in the Darkroom.

**Ticket orientation**: which end of a ticket leaves the printer first: **Bottom first** (the default: printed turned, so the ticket reads the right way up in the guest's hand) or **Top first**. Set in admin's **Settings → Printing**. It turns the photo receipt and the lottery ticket; setup and Wi-Fi tickets always print top first.
_Avoid_: upside down, rotation (in staff-facing text; rotation is a print setting that turns the photo only).

## Logs

**Logs page**: admin's page (`/logs`) with every part of the booth's logs in one live timeline: the Engine, the Shutter and admin servers, the system and browser reports. It filters by service, level, source and text, and the filter is in its address, so a view is a link. Reached from the sidebar next to **Docs**, from **Settings** on a phone, and from **View logs** on each health item. Its **Live** badge means new lines are arriving, not the lottery's **Live**.
_Avoid_: console, terminal.

**Log source**: one place the Logs page reads lines from, followed by the admin server: each PM2 process's log file (Engine, Shutter, Admin), and the system journal. A source is available, unavailable (no file yet, no journal), or rotated (its file started over).

**Browser report**: a warning or error logged by a page in a browser (the Shutter on the iPad, admin on a staff phone) and sent to the server that served it, which writes it to its log marked as coming from the browser, with the device's id.

## The Pi

**System page**: admin's page (`/system`) with the Pi's readings, live with the last hour: temperature, throttling, memory, CPU and storage. The admin server reads the Pi every 5 s, so the page works while the engine is down.

**Throttling**: the Pi's firmware running the CPU slower than it could, from heat or a weak supply. Its four flags are **under-voltage**, **clock capped**, **throttled** and **soft temperature limit**, each reported **now** and **since boot**.

**Since boot**: a throttle flag that was set at some point since the Pi last started, even if it is clear now. It is the trace of a supply dip or an overheat during the event; a restart clears it.

## Releases

**Release**: one version of the booth software, cut by a `v*` Git tag: the apps, the docs and the `booth` CLI together. It is written without the `v` (`0.8.0`, `0.8.0-rc.1`); the heartbeat reports the one a booth runs.

**Release bundle**: the file a release ships for booths, `dither-booth-<version>-linux-arm64.tar.zst`: the built apps, their dependencies and the docs, ready to run on the Pi. A booth only downloads and unpacks it; it never compiles.

## Booth state

**Maintenance**: the booth is closed to guests. They see “be right back” and can't start a visit, while the Darkroom still opens. A visit already under way finishes first.
_Avoid_: pause, offline, down.

**Maintenance reason**: why the booth is in maintenance: **manual**, **printer**, or both. The booth stays in maintenance while any reason holds.

**Manual maintenance**: maintenance staff switched on in admin. Only staff end it; a fixed printer never does.

**Automatic maintenance**: the switch that lets a printer that can't print put the booth in maintenance, and take it out once fixed. On unless staff turn it off.

## Printer

**Printer status**: what the printer reports, as staff read it: its conditions, whether it can print, and since when.

**Printer condition**: one thing wrong with the printer: paper low, out of paper, cover open, printer error, not connected, or checking (no status yet). Paper low is a warning: the printer still prints.

**Printer watch**: the engine keeping the printer connected and listening to its status for as long as it runs.
_Avoid_: watchdog (in staff-facing text).

## The cloud

**Hub**: the cloud side (Supabase, in the EU) that booths report to and staff are alerted from. The booth never depends on it to run an event.

**Booth**: one Dither Booth: its Pi, printer and iPad. Staff add and name it in the Studio app's **Booths**; the name can't be changed afterwards. It has one Hub registration at a time.

**Team** (`org` in the code): the staff who share booths and their alerts. Staff see only their team's booths, alerts and devices.
_Avoid_: org, organisation (in staff-facing text).

**Staff**: the people who set up and run booths. On the Hub, a member of a team; it is the only role.

**Heartbeat**: what a booth tells the Hub every 30 seconds: its release, its printer's conditions and its maintenance state. It carries the booth's state, not events, so repeating one is harmless. The Hub opens an alert when it changes for the worse and closes it when it clears.

**Alert**: something staff must act on, opened by the Hub from a heartbeat or a silence: **Out of paper**, **Printer error**, **Printer not connected**, **Paper low**, **Cover open** or **Silent booth**. It closes by itself when the condition clears, and staff can acknowledge it meanwhile. **Paper low** never fires on our booth: the printer is mounted upright, where its near-end sensor must stay off.

**Device**: a staff phone, iPad or computer that gets alerts as push notifications, once its owner turned them on in the Studio app (`push_subscription` in the code). A device the push service says is gone is forgotten.
_Avoid_: subscription (in staff-facing text).

**Reminder**: an alert pushed again: a critical alert still open and not acknowledged is pushed every 10 minutes.

**Acknowledge**: what staff do in the Studio app to say "I'm on it". It stops the reminders; the alert still closes by itself when the condition clears.
_Avoid_: dismiss, mute.

**Event times**: when a booth is expected to be running, set per booth in the Studio app (`live_from`, `live_until` in the code). Only then is a silent booth an alert. They live on the Hub and have nothing to do with the booth's event in admin, nor with its **start and end**: replacing that event leaves them as they are. Only the Hub can hold them, since a booth that never powers on can't report its own.
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

---
title: System
description: The Pi's software, temperature, throttling, memory, CPU and storage in admin, live with the last hour, what each reading means, and how to update, roll back, restart, reboot or power off.
sidebar:
  order: 5
---

Admin's **System** page shows the Raspberry Pi under the booth: how hot it is, whether its firmware is throttling it, how much memory and disk is left. The admin server reads the Pi every 5 s and keeps the last hour, so the page keeps working while the engine is down, which is when these numbers matter.

## Open System

On an iPad or a computer: the sidebar's **System** link, at the foot next to **Logs**. On a phone: **Settings → System → Open System**. The Pi's row in **Control Center → Health checks** sums it up and its **View system** opens the page.

The page heading has a badge: **Live** (the numbers are current), **Not updating** (the admin server answers, but its last reading is older than 15 s) or **Offline** (the admin server doesn't answer; the last reading stays on screen, with **Retry**). The **15 min / 1 h** tabs set how far back the charts go.

## What each panel means

Each panel's header carries a dot and a word. The dot's colour and the word say the same thing, so neither is needed alone.

| Panel           | Reads                                                                                                                                                                          | Fine                                       | Warning                                              | Critical                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| **Temperature** | The SoC, on a gauge that ends at 85 °C (the Pi 5's hard limit), and over the range                                                                                             | **Cool**, under 70 °C                      | **Warm**, 70 to 79 °C                                | **Hot**, 80 °C or more; or **Throttling**, a flag set now |
| **Throttling**  | Fan speed, CPU clock, and the firmware's four flags: **Under-voltage**, **Clock capped**, **Throttled**, **Soft temperature limit**, each **Clear**, **Since boot** or **Now** | **Clean since boot**                       | **Flagged since boot**: a flag was set at some point | **Throttling now**                                        |
| **Memory**      | Available RAM (the figure that counts: it includes cache the kernel gives back), the used share, and zram swap                                                                 | **Plenty free**, 15 % or more available    | **Running low**, under 15 %                          | **Nearly full**, under 5 %                                |
| **CPU**         | The busy share since the last read, and the load averages against the 4 cores                                                                                                  | **Keeping up**, 1 min load under the cores | **Busy**, load past the cores                        | **Overloaded**, load past twice the cores                 |
| **Storage**     | The microSD (`/`) and the SSD (`/mnt/ssd`): used share and free space                                                                                                          | **Room to spare**, 15 % or more free       | **Running low**, under 15 %                          | **Nearly full**, under 5 %                                |

The footer gives the Pi's model, how long it has been up and since when, when it was last read (by the Pi's own clock), and the reading cadence.

## Reading the throttle flags

The Pi's firmware keeps a flag for each thing it had to do to protect the board. Each flag shows one word: **Clear** (never set since the Pi started), **Since boot** (set at some point, not now) or **Now**. A flag that isn't clear says underneath what it means; for a clear one, tap its name. **Now** is urgent: the booth is slower than it should be at this moment. **Since boot** is the diagnosis an event's worth of "fine now" would hide: a supply that dipped once will dip again.

- **Under-voltage since boot** → use the official 27 W supply and check the USB-C cable. See [Troubleshooting](/docs/maintenance/troubleshooting/#the-pi-itself).
- **Soft temperature limit** or **Throttled** with a warm gauge → the cooler: contact with the SoC, the blower's intake under the M.2 shield, the air around the case.
- Flags clear when the Pi restarts. Every flag **Clear** after a restart in a hot room says the fix held.

## Update the software

The **Software** panel, at the top of the page, says which release the booth runs and whether a newer one is out. The admin server asks GitHub at start and every 6 hours; **Check now** asks again. Without internet (on the booth Wi-Fi, for one) it says **Couldn't check for updates**: plug in Ethernet or join a Wi-Fi with internet.

When a release is out, the panel says **0.8.0 is available**, with **What's new** (the release notes) and **Update to 0.8.0**:

1. Update **between events**: not during one, and not just before doors open.
2. Press **Update to 0.8.0**. The dialog lists what the update needs: the booth reaches GitHub, enough room on the SD card, nothing else running. A failed line keeps **Update** off. Under it, what you should know, in amber: the event is running, guests used the booth in the last 15 minutes, a ticket is printing. Those don't stop you; the button then reads **Update anyway**.
3. The panel shows a gauge filling up and the steps as they run: **Check**, **Update the booth tool**, **Download**, **Install**, **Back up the database**, **Switch**, **Set up the system**, **Restart**, **Check it started**. Guests can use the booth until **Switch**. **Details** opens the update's own lines, and a link to the Logs page for all of them.
4. At **Restart** the page says **The booth is restarting. This page reconnects on its own.** Stay on it. Once the admin is back on the new release, the page reloads, and so does the iPad's Shutter (once it's back on its landing screen).
5. The panel ends on one of, with a mark that draws itself:
   - **Updated to 0.8.0**: done. Do a test print from the Darkroom.
   - **The update stopped. The booth still runs 0.7.2.**, with the reason: nothing changed. Fix the reason (internet, room on the SD card) and try again. "Interrupted during …" means the Pi lost power or the update crashed; the booth ended it at its next start.
   - **0.8.0 didn't start. The booth went back to 0.7.2.**: the booth went back on its own, with its database. Tell a developer, with the reason shown.

The sidebar's **System** link shows a dot while an update waits or the last one went wrong, and **Control Center → Health checks** has a **Software** row with the release and the latest one.

**Before the last update: 0.7.2** with **Roll back** goes back by hand. The row only shows while the earlier release is still on the booth. When the newer release changed the database, the panel says so, and rolling back restores the copy taken before the update: the dialog says when it was taken, and visits and draws since then are lost. The button is then **Roll back and restore**.

A booth that still runs a git checkout (set up before releases) offers the update too: its first update turns it into a release. It can't roll back until then. More: [Update the booth](/docs/maintenance/update-the-booth/).

## Restart, reboot or power off

The **Power** panel, at the foot of the page, has three buttons. Each asks first.

| Button           | What happens                                                                        | The page then shows                                                                      |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Restart apps** | The engine, the admin and the Shutter start again. The Pi stays on.                 | **Restarting**, then a **The booth is back.** message once admin answers again           |
| **Reboot**       | The whole Pi starts again.                                                          | **Rebooting**, then **The booth is back.**                                               |
| **Power off**    | The Pi shuts down. It can't be turned back on from admin: unplug it and plug it in. | **Shutting down**, then **The booth has shut down.** once admin has been silent for 10 s |

Guests can't use the booth until it's back. Stay on the page: it reconnects on its own. If the booth hasn't answered after 5 minutes, the panel says so: check that it's plugged in and on the same network as your device.

**The booth doesn't allow this yet** means the booth's permissions predate the Power panel: run `sudo booth service` once over SSH.

## Off the booth

On a development machine the Temperature, Throttling and Memory panels say **Not on a Pi** and explain what only the Pi reports: heat, fan, throttling, and the kernel's available-memory figure. CPU, uptime and the root disk still read, from the machine you are on. The **Software** and **Power** panels say **On the booth only**, and Power's buttons stay off: there they would restart the computer you are on.

## Over SSH

The same readings by hand, when admin is out of reach: [Health checks → System health](/docs/maintenance/health-checks/#system-health).

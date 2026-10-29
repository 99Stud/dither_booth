---
title: System
description: The Pi's temperature, throttling, memory, CPU and storage in admin, live with the last hour, what each reading means, and the Power panel to restart, reboot or power off.
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

On a development machine the Temperature, Throttling and Memory panels say **Not on a Pi** and explain what only the Pi reports: heat, fan, throttling, and the kernel's available-memory figure. CPU, uptime and the root disk still read, from the machine you are on. The **Power** panel says **On the booth only** and its buttons stay off: there they would restart the computer you are on.

## Over SSH

The same readings by hand, when admin is out of reach: [Health checks → System health](/docs/maintenance/health-checks/#system-health).

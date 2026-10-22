---
title: What Dither Booth is
description: The booth in one page — hardware, the three apps, and what happens during a guest visit.
sidebar:
  order: 1
---

Dither Booth is a self-service photo kiosk. A guest taps the screen, poses, and a few seconds later a thermal receipt printer hands them a **dithered black-and-white portrait** and, when the event runs one, a **lottery ticket** that may win a prize.

Everything runs on the booth itself. There is no cloud dependency at the event: the booth keeps working with no internet, and it can even bring up its own Wi-Fi when the venue has none.

## The hardware

| Part                          | Role                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Raspberry Pi 5 (4 GB)**     | The booth's computer. Runs the engine, both web apps, and a headless Chromium that lays out receipts. |
| **NVMe SSD on an M.2 shield** | Holds the database and booth data at `/mnt/ssd`. The OS boots from the microSD card.                  |
| **Epson TM-T20III (USB)**     | 80 mm thermal receipt printer, driven with raw ESC/POS. No driver, no CUPS.                           |
| **iPad**                      | The guest screen and camera. Runs the Shutter in Safari, locked with Guided Access.                   |

Parts, references and assembly are in [Parts and assembly](/docs/build/parts-and-assembly/).

## The software

Three processes run on the Pi under PM2, started by `ditherbooth.service` at boot:

| App         | Port                   | Who uses it                 | What it does                                                                                                                                                                                      |
| ----------- | ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shutter** | `3000` (HTTPS)         | Guests, on the iPad         | The guest experience (camera, countdown, slot machine), the **Darkroom** for print tuning, and the receipt layout page Chromium prints from. Also serves the plain-HTTP **setup page** on `3003`. |
| **Engine**  | `3001` (loopback only) | The two web apps            | The backend. Owns the database, the lottery, the printer connection, the network, and the kiosk channel.                                                                                          |
| **Admin**   | `3002` (HTTPS)         | Staff, on a laptop or phone | Control Center (booth screen, printer, live camera, health, network), the Event page (lottery, prizes, draws) and Settings.                                                                       |

A fourth piece, the **`booth` CLI**, is a standalone binary that provisions the Pi and runs its health checks. A small companion service, `ditherbooth-network.service`, watches the network and opens the booth's own Wi-Fi when it needs to.

## A guest visit

1. The iPad shows the landing screen. The guest taps **Start**.
2. The camera opens, a prompt appears (“stay in the frame”), a countdown runs, then “smile” — and the photo is taken.
3. The photo goes to the engine, which in one step **draws the lottery** and **renders both receipts**: Chromium lays out the photo receipt from the event's kit, the photo is dithered to 1-bit, and the result becomes a printer raster.
4. While that happens, the iPad plays a **slot machine** whose reels land on the real outcome.
5. Once the reels stop, the iPad asks the engine to **print**. The photo receipt comes out, then the lottery ticket.
6. The screen resets for the next guest.

The detailed flow, with the timing and failure rules, is in [A guest visit, end to end](/docs/architecture/guest-visit/).

## Who does what

- **Guests** only ever see the Shutter on the iPad.
- **Staff on site** use the printed tickets, the Darkroom on the iPad (behind a PIN) and the admin on their own phone or laptop.
- **Whoever maintains the booth** uses SSH and the `booth` CLI on the Pi.

The words used across the booth, the staff and the code are in the [Glossary](/docs/start-here/glossary/).

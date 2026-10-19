# Raspberry Pi setup

This guide takes a booth from a box of parts to a Pi that prints receipts. It covers the hardware we buy, how to assemble it, how to flash and prepare it, and the hand-off to the `booth` CLI, which does the software side (see the [CLI README](../apps/cli/README.md)).

The guest screen is still an iPad for now. [Own screen and camera](#own-screen-and-camera-planned) describes what changes when the booth gets its own display.

## Parts

| Part                                                  | Role                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Raspberry Pi 5, 4 GB                                  | Runs engine, admin and shutter, plus a headless Chrome for receipts    |
| Official Raspberry Pi 27 W USB-C power supply         | Lets the Pi deliver its full 1.6 A across the USB ports                |
| Geekworm H505 active cooler                           | Heatsink and blower fan on the SoC                                     |
| Geekworm X1001 PCIe to M.2 shield (top)               | Holds the NVMe drive over the Pi's PCIe ribbon                         |
| Patriot P300 M.2 2280 NVMe, 256 GB                    | Data drive: database and booth data (`/mnt/ssd`)                       |
| Lexar Blue microSDXC, 128 GB (A2)                     | Boot drive: Raspberry Pi OS                                            |
| Epson TM-T20III, USB                                  | Receipt printer, driven with raw ESC/POS over USB (no driver, no CUPS) |
| Double Dragon thermal rolls, 80 × 80 mm, 12.7 mm core | Receipt paper                                                          |
| iPad                                                  | Guest screen and camera, running the shutter in Safari                 |

You also need a Mac or PC with a microSD reader, and a Wi-Fi network or Ethernet cable shared by the Pi and the iPad.

## 1. Assemble the Pi

1. **Cooler.** Remove the protective film from the H505's thermal pads, seat it over the SoC and fix it to the board. Plug the fan cable into the Pi 5's `FAN` header. The firmware drives the fan from then on; there is nothing to configure.
2. **NVMe shield.** Screw the X1001's standoffs into the Pi's mounting holes. Connect the PCIe ribbon cable to the Pi's `PCIe` connector and to the shield, contacts facing the way the X1001 instructions show, with both connector latches closed. A ribbon in backwards is the usual reason the drive does not show up.
3. **Drive.** Insert the Patriot P300 into the shield's M.2 slot and fix it with the screw at the 2280 position.
4. **Airflow.** The shield sits right above the cooler. Check that the standoffs leave the blower's intake open: the booth keeps the CPU busy with Chrome and the dithering.

Leave the microSD card out for now.

## 2. Flash Raspberry Pi OS

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer:

- **Device:** Raspberry Pi 5.
- **OS:** Raspberry Pi OS (other) → **Raspberry Pi OS Lite (64-bit)**. The Pi has no screen of its own, so the desktop image only costs memory. 64-bit is required: Bun has no 32-bit ARM build.
- **Storage:** the Lexar microSD card.

Under **Edit settings** before writing:

- **Hostname:** for example `booth`. The certificate covers `<hostname>.local`, so pick it now; changing it later means regenerating the certificate.
- **Username:** `pi`. The CLI's systemd service runs as `pi` by default. If you choose another name, run every `booth` command with `BOOTH_SERVICE_USER=<name>`.
- **Wi-Fi:** the country, plus your office network if you like. Venue networks are added later from the Darkroom or admin (step 7), so you never reflash for a new venue.
- **Locale:** your time zone and keyboard layout.
- **Services:** enable SSH.

Write the card, put it in the Pi, connect the power supply and wait a minute or two for the first boot.

## 3. First boot

From your computer:

```bash
ssh pi@booth.local
```

Bring the system and the bootloader up to date:

```bash
sudo apt update && sudo apt full-upgrade -y
```

```bash
sudo rpi-eeprom-update -a
```

Check that the NVMe drive is visible:

```bash
lsblk -f
```

It shows up as `nvme0n1`. On our booth with current firmware, the Pi detected the X1001 without any configuration. If `nvme0n1` is missing, enable the PCIe connector by adding this line at the end of `/boot/firmware/config.txt`, then reboot:

```bash
echo 'dtparam=pciex1' | sudo tee -a /boot/firmware/config.txt
```

```bash
sudo reboot
```

If it is still missing, recheck the ribbon cable orientation and its latches. Keep the link at its default Gen 2 speed: `dtparam=pciex1_gen=3` is faster but not officially supported, and the booth only needs the drive for a small SQLite database.

The Pi doesn't need a fixed address. When it starts on a network with a new IP, `ditherbooth.service` re-issues the TLS certificate for that address before the apps start. The CA stays the same, so iPads that already trust the booth keep working.

## 4. Prepare the NVMe drive

The CLI never formats disks: it looks for an unmounted ext4 partition and mounts it at `/mnt/ssd`. If `lsblk -f` already shows `nvme0n1p1` as `ext4` and the drive holds nothing you need, skip to the next step. Otherwise create one. **This erases the whole drive**, so check that the device really is the NVMe and not the SD card (`mmcblk0`):

```bash
sudo parted /dev/nvme0n1 --script mklabel gpt mkpart booth-data ext4 0% 100%
```

```bash
sudo mkfs.ext4 -L booth-data /dev/nvme0n1p1
```

Leave it unmounted. `booth install` adds it to `/etc/fstab` and moves the database onto it.

## 5. Connect the printer

1. Power the TM-T20III with its own power brick. It does not draw from the Pi.
2. Load a roll: open the cover, drop the roll in following the diagram inside the cover, pull a few centimetres of paper past the cutter and close the cover.
3. Optional self-test: with the printer off, hold **Feed** and switch it on. It prints its settings page.
4. Connect it to one of the Pi's black USB 2 ports. Keep the blue USB 3 ports for a camera later.
5. Check that the Pi sees it:

```bash
lsusb | grep -i 04b8
```

`04b8` is Epson's USB vendor ID. If nothing is listed, try another cable or port.

## 6. Install the booth software

Install the `booth` CLI and run the full provisioning:

```bash
curl -fsSL https://github.com/99Stud/dither_booth/releases/latest/download/install.sh | sudo bash
```

```bash
sudo booth install
```

This installs the system packages, Bun and the repo in `/opt/dither-booth`, mounts the NVMe and moves the database onto it, generates the TLS certificate for the Pi's LAN IP, enables `ditherbooth.service`, sets up the booth's own Wi-Fi fallback (`ditherbooth-network.service`), and ends with the QR that connects the iPad. When it finishes, run the health checks:

```bash
booth doctor
```

Every critical check should pass: SSD mount, data symlink, Bun, certificate IP, service, PM2 processes and the three `healthz` endpoints. The [CLI README](../apps/cli/README.md) documents each command if you need to rerun one step.

## 7. Connect the iPad

The apps are served over HTTPS with a local mkcert certificate, and Safari blocks the camera until the iPad trusts the booth's CA. That happens once per iPad. After that, only the booth's address changes from venue to venue, and the booth prints it.

**At power-on, the receipt printer prints a setup ticket**, once per boot and again when the booth lands on another network. Scan its QR with the iPad camera:

- **New iPad:** the page walks you through it. Download the certificate, install it in **Settings → General → VPN & Device Management**, turn on full trust in **Settings → General → About → Certificate Trust Settings**, then tap **Check again**. It has to be Safari: the page says so if it's opened in another browser.
- **iPad that already trusts the booth:** the page shows **Open the Shutter** straight away, plus the Darkroom and the admin. It prefers `https://<hostname>.local:3000` when that resolves, so a Home Screen icon made from it survives the next venue's new IP.

If the first QR gives "Safari can't open the page… not connected to the internet", scan the second one, at `http://<hostname>.local:3003`. Some networks, an iPhone's Personal Hotspot among them, give the iPad no IPv4 address (Settings → Wi-Fi shows `192.0.0.2`), so it can't reach the booth's IP and only finds it by name, over IPv6.

For kiosk use, add the Shutter to the Home Screen and turn on Guided Access. The same QR is on admin's Control Center (**Network** card, with **Print setup ticket**) and in the terminal with `booth qr`. To trust the booth on a laptop instead, `booth cert copy` prints the `scp` command that copies the root CA.

### Wi-Fi at a venue

The booth joins every saved network on its own. Add the venue's Wi-Fi the day before, from admin's **Settings → Wi-Fi** or the Darkroom (**Save for later**), and the booth joins it on site without anyone touching it.

When no saved network is around for 45 seconds, the booth opens **its own Wi-Fi** (`DitherBooth-XXXX`) and prints a **Wi-Fi ticket**:

1. Scan the first QR to join the booth Wi-Fi. The name and password are printed under it.
2. The phone, iPad or laptop shows the booth's **Wi-Fi picker** on its own, the way hotel Wi-Fi shows its login page. Pick the venue network, type its password and tap **Join**. No certificate is needed for this. The booth switches over and prints a setup ticket headed **On <venue network>** with its new address. Join that network on the device and scan the ticket.

If the picker doesn't appear, scan the ticket's second QR and use the admin's **Settings → Wi-Fi** or **Darkroom → Wi-Fi** instead.

If the booth can't join (a wrong password, or the network is out of range), it goes straight back to its own Wi-Fi and prints a Wi-Fi ticket that starts with why, such as **Couldn't join Venue-Guest: Wrong password.** Join the booth Wi-Fi again and retry.

If the venue Wi-Fi keeps devices apart (the page never loads), or there is no Wi-Fi at all, tap **Run the event on the booth Wi-Fi** in the picker (or **Run on booth Wi-Fi** in the Darkroom). Devices on the booth Wi-Fi stop seeing the picker, and the event runs on the booth's own network. Photos still print, and cloud sync waits for a network (an Ethernet cable gives it one).

If the booth is stuck on a network the iPad can't reach, **power it off and on twice within two minutes**: the second boot forces the booth Wi-Fi and prints the Wi-Fi ticket. Venue Wi-Fi with a captive login page doesn't work; use the booth Wi-Fi there.

## 8. Check the whole chain

- Open the admin at `https://booth.local:3002` (or `https://<PI_IP>:3002`). The Health card in the Control Center should show the printer and Puppeteer as healthy.
- Open the Shutter on the iPad at `https://booth.local:3000`, then use the Darkroom's test print. A receipt should come out within a few seconds.

## Paper

The Double Dragon rolls fit the TM-T20III: 80 mm wide (the printer takes 79.5 ± 0.5 mm), 80 mm across (83 mm max), on a 12.7 mm core. The listing does not give the roll length; from the roll's size it is about **70–80 m**, so count on roughly 75 m.

A photo receipt is about 1,400 dots, around 175 mm, plus feed and cut, so **one roll gives about 350–400 photo receipts**, fewer when lottery tickets print. A pack of 20 rolls covers about 7,000 guests. Count the receipts from the first full roll at an event to replace this estimate with a real number.

When a roll is nearly finished, a red stripe appears on the paper. The printer's sensors cannot see it; it is a reminder for staff to have the next roll ready.

Some reviews find this paper thick and the print faint on some printers. If dithered photos look washed out, raise the printer's print density before changing the dither settings.

## Troubleshooting

| Symptom                                               | Check                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nvme0n1` missing from `lsblk`                        | Ribbon cable orientation and latches, `dtparam=pciex1` in `/boot/firmware/config.txt`, bootloader updated with `rpi-eeprom-update -a`.                                                                                                                                                      |
| `booth ssd` cannot find the SSD partition             | The NVMe needs an unmounted ext4 partition (step 4). Force it with `BOOTH_SSD_DEVICE=/dev/nvme0n1p1`.                                                                                                                                                                                       |
| `Error opening terminal: xterm-ghostty`               | The Pi has no terminfo for Ghostty. Prefix the command with `TERM=xterm-256color` (`sudo TERM=xterm-256color nano …`), or install the entry: `infocmp -x xterm-ghostty > xterm-ghostty.ti` on the Mac, copy it over, then `tic -x xterm-ghostty.ti` (and `sudo tic -x` for root) on the Pi. |
| Printer missing from `lsusb`                          | Printer powered on, cable, another USB port.                                                                                                                                                                                                                                                |
| Printing fails with `LIBUSB_ERROR_ACCESS`             | The service user cannot open the USB device. Add a udev rule such as `SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", MODE="0660", GROUP="plugdev"`, add the user to `plugdev`, then reboot.                                                                                                      |
| Safari shows a certificate warning or no camera       | Certificate trust steps on the iPad (step 7). A new IP needs no new trust: the booth re-issues its certificate at start-up. Run `booth cert --if-changed` and `booth doctor` if it didn't.                                                                                                  |
| iPad: "not connected to the internet" on the setup QR | The iPad has no IPv4 route to the booth (its Wi-Fi IP is `192.0.0.2`, as on an iPhone hotspot). Scan the ticket's second QR (`http://<hostname>.local:3003`), or run the event on the booth Wi-Fi.                                                                                          |
| Puppeteer fails in the admin Health card              | Rerun `sudo booth install` so the Chromium libraries get installed, then check `booth doctor`.                                                                                                                                                                                              |
| The Pi throttles or the fan is loud                   | Run `vcgencmd get_throttled` (`0x0` means fine). Check the cooler's contact and that the X1001 does not block the blower's intake.                                                                                                                                                          |

## Own screen and camera (planned)

The booth is moving off the iPad to its own touchscreen (probably a Waveshare panel) on the Pi. None of this is in the CLI yet; this is the plan:

- **OS:** stay on Raspberry Pi OS Lite and add [`cage`](https://github.com/cage-kiosk/cage), a Wayland compositor that shows a single app full screen, running `chromium --kiosk` on the Shutter. No desktop, no panel, no pop-ups for guests to tap.
- **Camera:** a USB webcam on a blue USB 3 port. Chromium reads USB (UVC) webcams directly; the CSI Raspberry Pi Camera goes through libcamera, which Chromium does not pick up on its own.
- **No prompts:** a Chromium managed policy (`VideoCaptureAllowedUrls`) grants the camera to the Shutter, and the mkcert root CA goes into the kiosk user's certificate store.
- **Screen:** an HDMI panel with USB touch works without setup. A DSI panel needs its `dtoverlay` in `/boot/firmware/config.txt`, and its ribbon has to be routed around the X1001.
- **Memory:** with 4 GB, the kiosk Chromium runs next to the receipt Chrome, so keep the Lite image. Raspberry Pi OS on Trixie already sets up zram swap (`swapon --show` lists `zram0`). Measure with `free -h` during a full shoot-and-print cycle.

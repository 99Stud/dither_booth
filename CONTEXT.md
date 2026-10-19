# Dither Booth

The words the booth, its staff and this code use for the same things.

## Booth state

**Maintenance**: the booth is closed to guests. They see "be right back" and can't start a visit, while the Darkroom still opens. A visit already under way finishes first.
_Avoid_: pause, offline, down

**Maintenance reason**: why the booth is in maintenance. It's one of **manual** or **printer**, or both at once. The booth stays in maintenance while any reason holds.

**Manual maintenance**: maintenance staff switched on in admin. Only staff end it; a fixed printer never does.

**Automatic maintenance**: the switch that lets a printer that can't print put the booth in maintenance, and take it out once fixed. It's on unless staff turn it off.

## Printer

**Printer status**: what the receipt printer reports, as staff read it: its **conditions**, whether it **can print**, and since when.

**Printer condition**: one thing wrong with the printer: paper low, out of paper, cover open, printer error, not connected, or checking (no status yet). Paper low is a warning: the printer still prints.

**Printer watch**: the engine keeping the printer connected and listening to its status for as long as it runs.
_Avoid_: watchdog (in staff-facing text)

## Connecting devices

**Setup page**: the plain-HTTP page (port 3003) where a device trusts the booth once, then opens the Shutter. It knows whether the device already trusts the booth.

**Setup ticket**: what the receipt printer prints at power-on and on a new network: a QR to the setup page and the booth's address.

**Booth Wi-Fi**: the booth's own Wi-Fi network (`DitherBooth-XXXX`). It opens when no saved network is around, or when staff choose to run the event on it.
_Avoid_: hotspot, access point (in staff-facing text)

**Wi-Fi ticket**: what the printer prints when the booth Wi-Fi opens: a QR to join it and a QR to the setup page.

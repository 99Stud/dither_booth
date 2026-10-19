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

---
title: Files and services
description: Every file, directory and systemd unit the booth installs or uses on the Pi.
sidebar:
  order: 5
---

## systemd units

| Unit                          | Runs as | What                                                                                                                                                                                                                                                        |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ditherbooth.service`         | `pi`    | `Type=forking` PM2 daemon. `ExecStartPre=-booth cert --if-changed`, `ExecStart=bun run pm2:start`, `ExecReload=bun run pm2:reload`, `ExecStop=pm2 kill`. `Restart=on-failure`. After `network-online.target`; requires the SSD mount when the repo is on it |
| `ditherbooth-network.service` | root    | `booth network watch`, `Restart=always`                                                                                                                                                                                                                     |
| `avahi-daemon.service`        | —       | mDNS (`<hostname>.local`), restarted by the watch when renamed                                                                                                                                                                                              |
| `NetworkManager.service`      | —       | All networks, including the booth Wi-Fi                                                                                                                                                                                                                     |

```bash
systemctl status ditherbooth.service ditherbooth-network.service
sudo systemctl restart ditherbooth.service
```

Don't run `bun run start` or a second `pm2 start` on the booth: systemd owns PM2.

## PM2 processes

Defined in `pm2.config.js`:

| Name                   | cwd            | Memory cap                                                       |
| ---------------------- | -------------- | ---------------------------------------------------------------- |
| `dither-booth-engine`  | `apps/engine`  | 1 GB                                                             |
| `dither-booth-admin`   | `apps/admin`   | 256 MB (must stay `instances: 1`: its restart lock is in memory) |
| `dither-booth-shutter` | `apps/shutter` | 256 MB                                                           |

All: `fork` mode, `autorestart`, exponential backoff from 1 s, at most 10 restarts, 10 s minimum uptime, 25 s kill timeout (covers an in-flight Puppeteer navigation, so the next start doesn't hit `EADDRINUSE`).

Logs: `log_type: "json"`, one combined `log_file` per process at `logs/pm2/<process>.log`, `out_file` and `error_file` set to `/dev/null` so PM2 writes nothing else. See [Logs](/docs/maintenance/logs/) for the line format and rotation.

## Files written by the CLI

| Path                                                            | Written by                       | Purpose                                                                               |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `/usr/local/bin/booth`                                          | `install.sh`                     | The CLI                                                                               |
| `/opt/dither-booth`                                             | `booth update`                   | Symlink to the running release; a git checkout before the first update (`booth repo`) |
| `/opt/dither-booth-releases/<version>/`                         | `booth update`                   | One unpacked release bundle each: the running one and the one before                  |
| `/opt/dither-booth-releases/legacy-<git describe>/`             | `booth update` (first run)       | The checkout the booth ran before releases                                            |
| `/opt/dither-booth-shared/.local/`, `logs/`                     | `booth update`                   | What outlives a release, linked into each                                             |
| `/var/cache/ditherbooth/`                                       | `booth update`                   | The last release's bundle and CLI download                                            |
| `/var/lib/ditherbooth/update/status.json`, `history.json`       | `booth update`, `booth rollback` | The job running or last run (with its process id); finished jobs, newest first        |
| `/var/lib/ditherbooth/update/rollback.json`                     | `booth update`, `booth rollback` | Where a rollback goes now, as admin offers it                                         |
| `/var/lib/ditherbooth/update/lock`                              | `booth update`, `booth rollback` | The process running a job (pid, boot, start time): one at a time                      |
| `/mnt/ssd/dither-booth/backups/update-*.sqlite`                 | `booth update`                   | The database before each switch, last 3 kept                                          |
| `/mnt/ssd/dither-booth/backups/restore-*.sqlite`                | `booth restore`                  | The database each restore replaced, last 3 kept                                       |
| `/etc/systemd/system/ditherbooth-update@.service`               | `booth service`                  | Runs `booth update <version>` as root for admin                                       |
| `/etc/systemd/system/ditherbooth-rollback@.service`             | `booth service`                  | Runs `booth rollback` as root (`keep-db` or `restore-db`)                             |
| `/etc/fstab` entry for `/mnt/ssd`                               | `booth ssd`                      | SSD mount                                                                             |
| `/etc/systemd/system/ditherbooth.service`                       | `booth service`                  | Main unit                                                                             |
| `/etc/NetworkManager/dispatcher.d/90-ditherbooth`               | `booth service`                  | Restarts the service on a new IP                                                      |
| `/etc/logrotate.d/ditherbooth`                                  | `booth service`                  | Rotates the PM2 log files                                                             |
| `/etc/systemd/system/logrotate.timer.d/ditherbooth.conf`        | `booth service`                  | Runs logrotate hourly, not daily                                                      |
| `pi` in group `systemd-journal`                                 | `booth service`                  | Lets `pi` read the system journal                                                     |
| `/etc/polkit-1/rules.d/50-ditherbooth-system.rules`             | `booth service`                  | Lets admin restart, reboot, power off, update and roll back                           |
| `/etc/systemd/system/ditherbooth-network.service`               | `booth network setup`            | Network watch unit                                                                    |
| `/etc/polkit-1/rules.d/50-ditherbooth-network.rules`            | `booth network setup`            | Lets `pi` manage Wi-Fi                                                                |
| `/etc/NetworkManager/dnsmasq-shared.d/ditherbooth-captive.conf` | `booth network setup`            | Captive probe hosts → `10.42.0.1`                                                     |
| NetworkManager profile `booth-hotspot`                          | `booth network setup`            | The booth Wi-Fi                                                                       |
| nftables table `ip ditherbooth`                                 | `booth network watch` (at start) | `10.42.0.1:80` → `:3003`                                                              |

## Files written at runtime

Paths relative to `/opt/dither-booth` unless absolute. On a booth that runs releases, `.local` and `logs` are links to `/opt/dither-booth-shared/`.

| Path                                                | Written by                                      | Purpose                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/engine/data/` → `/mnt/ssd/dither-booth/data/` | engine                                          | SQLite database, added fonts (`fonts/`) and logos (`logos/`), event backups (`backups/`, the last 288)    |
| `.local/tls/booth-cert.pem`, `booth-key.pem`        | `booth cert`                                    | Leaf certificate and key                                                                                  |
| `.local/tls/booth-manifest.json`                    | `booth cert`                                    | Public IP, hostnames, CA path                                                                             |
| `.local/runtime/setup-server-token`                 | engine, at start                                | Owner-only token for `captive.*`                                                                          |
| `.local/device-setup/last-ticket`                   | engine                                          | Last setup ticket printed (boot id + key)                                                                 |
| `logs/pm2/<process>.log`                            | PM2                                             | App logs, one JSON entry per line; rotated to `.1.gz`–`.7.gz`; read by the admin server for the Logs page |
| `apps/docs/dist/`                                   | the release bundle (`booth repo` on a checkout) | This site, served by admin at `/docs/`                                                                    |
| `/var/lib/ditherbooth/prefer-hotspot`               | engine                                          | Present while staff run the event on the booth Wi-Fi                                                      |
| `/var/lib/ditherbooth/wifi-scan.json`               | network watch                                   | Networks seen before the booth Wi-Fi took the radio                                                       |
| `/var/lib/ditherbooth/early-boot`                   | network watch                                   | Double power-cycle marker, removed after 2 min uptime                                                     |
| `~pi/.pm2/`                                         | PM2                                             | Daemon state, PID file                                                                                    |
| mkcert CAROOT (`mkcert -CAROOT`)                    | `booth cert`                                    | Booth CA: `rootCA.pem`, `rootCA-key.pem`                                                                  |

## Hardware

|            |                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------- |
| SSD        | ext4 partition, mounted at `/mnt/ssd`                                                           |
| Printer    | USB `04b8:0e28`, `/dev/bus/usb/…` `root:lp`                                                     |
| Wi-Fi      | The Pi's single radio: client mode on venue networks, AP mode (2.4 GHz) for the booth Wi-Fi     |
| SoC heat   | `/sys/class/thermal/thermal_zone0/temp` (millidegrees), read by the admin server every 5 s      |
| Fan        | The Pi 5 `FAN` header: `/sys/class/hwmon/hwmon*/` whose `name` is `pwmfan`, `fan1_input` in RPM |
| Throttling | `vcgencmd get_throttled`, run as `pi` (the `video` group, a Raspberry Pi OS default)            |

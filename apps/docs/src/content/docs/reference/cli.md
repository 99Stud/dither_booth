---
title: booth CLI
description: Every command and option of the booth provisioning CLI.
sidebar:
  order: 1
---

`booth` is a single static binary (compiled with `bun build --compile`) that provisions and manages a booth Pi. Built with [Citty](https://github.com/unjs/citty) for commands and [Clack](https://www.npmjs.com/package/@clack/prompts) for the UI.

Requirements: 64-bit Raspberry Pi OS (Linux `arm64`), or Linux `x64` for development. 32-bit isn't supported: Bun has no 32-bit ARM target.

## Install

```bash
curl -fsSL https://github.com/99Stud/dither_booth/releases/latest/download/install.sh | sudo bash
```

Downloads `booth-linux-<arch>` from the latest release into `/usr/local/bin/booth`.

## Commands

Every command is idempotent: re-running it on a provisioned booth changes only what's out of date.

| Command              | Root | Description                                                                                                                                                                                                      |
| -------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install`            | yes  | Full provisioning: apt packages, `bun`, `repo`, `ssd`, `db`, `cert`, `service`, `network setup`, `doctor`, `qr`                                                                                                  |
| `bun`                |      | Install Bun for the service user if missing                                                                                                                                                                      |
| `repo`               |      | Clone or `git pull --ff-only` into `/opt/dither-booth`, `bun install`, `bun run build`, Puppeteer's browser (x64 only; arm64 uses apt's Chromium)                                                                |
| `ssd`                | yes  | Mount the ext4 SSD partition at `/mnt/ssd` (via `/etc/fstab`) and move the database onto it. Never formats, never overwrites: refuses when the SD card and the SSD both hold a database                          |
| `db`                 |      | Apply migrations and seed the default print configuration                                                                                                                                                        |
| `cert`               |      | Generate the TLS certificate for the auto-detected LAN IP (same as `cert generate`)                                                                                                                              |
| `cert generate [ip]` |      | Generate it for an explicit or auto-detected IP                                                                                                                                                                  |
| `cert --if-changed`  |      | Re-issue only if the LAN IP changed, keeping the CA. Run by `ditherbooth.service` at start                                                                                                                       |
| `cert copy`          |      | Print the `scp` command that copies the root CA to your machine                                                                                                                                                  |
| `qr`                 |      | Show the QR that connects an iPad (the same as the setup ticket's)                                                                                                                                               |
| `network setup`      | yes  | Create the booth Wi-Fi, its captive page DNS, the polkit rule, and `ditherbooth-network.service`. Re-run after updates when `doctor` says it's out of date                                                       |
| `network watch`      | yes  | The network watch loop. Run by `ditherbooth-network.service`; not for interactive use                                                                                                                            |
| `service`            | yes  | Install and enable `ditherbooth.service`, the NetworkManager dispatcher hook, the PM2 log rotation rule and an hourly `logrotate.timer`; add `pi` to `systemd-journal` (restarts a running service when it does) |
| `doctor`             |      | Health checks. Exit code 1 if any check fails. See [Health checks](/docs/maintenance/health-checks/)                                                                                                             |
| `complete <shell>`   |      | Print shell completions (`bash`, `zsh`, `fish`, `powershell`)                                                                                                                                                    |

## Options

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| `-y, --yes`     | Assume yes for destructive prompts (non-interactive) |
| `--color=WHEN`  | `auto` (default), `always`, `never`                  |
| `--no-banner`   | Suppress the startup banner                          |
| `-h, --help`    | Help                                                 |
| `-v, --version` | Version (set at compile time from the release tag)   |

## Environment

| Variable             | Default                                      | Purpose                                                          |
| -------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `BOOTH_REPO`         | `/opt/dither-booth`                          | Repo root. The compiled binary can't derive it from its own path |
| `BOOTH_REPO_URL`     | `https://github.com/99Stud/dither_booth.git` | Clone URL                                                        |
| `BOOTH_SSD_DEVICE`   | auto-detected                                | Force the SSD partition, e.g. `/dev/nvme0n1p1`                   |
| `BOOTH_SERVICE_USER` | `pi`                                         | System user the service runs as                                  |
| `BOOTH_NO_BANNER`    | unset                                        | Disable the banner                                               |
| `NO_COLOR`           | unset                                        | Disable colour ([no-color.org](https://no-color.org/))           |

## Shell completions

```bash
booth complete zsh > ~/.booth-complete.zsh
echo 'source ~/.booth-complete.zsh' >> ~/.zshrc
```

## Developing the CLI

```bash
bun run --filter @dither-booth/cli dev -- --help
bun run --filter @dither-booth/cli build   # compiles arm64 + x64 into dist/
```

Root `bun run dev` and `bun run build` exclude the CLI. Releasing: [Releases](/docs/development/releases/).

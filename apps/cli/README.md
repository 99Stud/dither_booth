# Dither Booth CLI (`booth`)

`booth` is a single static binary that provisions and manages a Dither Booth Raspberry Pi. It installs Bun, syncs and builds the repo, mounts the SSD and relocates the database, generates the TLS certificate, installs a systemd service that wraps PM2, and runs health checks.

The binary is standalone (compiled with `bun build --compile`), so the Pi does not need Bun or Node installed beforehand to run the CLI itself.

## Requirements

- 64-bit Raspberry Pi OS (Linux `arm64`) or Linux `x64` for dev/testing. 32-bit Pi OS is not supported (Bun has no 32-bit ARM target).
- An SSD pre-formatted as `ext4` (the CLI never formats disks).

## Install

```bash
curl -fsSL https://github.com/99stud/dither_booth/releases/latest/download/install.sh | sudo bash
```

This detects the architecture, downloads the matching `booth-linux-<arch>` binary, and installs it to `/usr/local/bin/booth`.

## Usage

```bash
sudo booth install      # full first-time provisioning
booth doctor            # health checks
```

### Commands

| Command     | Description                                                                         |
| ----------- | ----------------------------------------------------------------------------------- |
| `install`   | Full provisioning: apt deps, Bun, repo, SSD, db, cert, service, doctor (needs root) |
| `bun`       | Install the Bun runtime if missing                                                  |
| `repo`      | Clone/pull repo into `/opt/dither-booth`, install deps, build, reinstall Puppeteer  |
| `ssd`       | Mount the SSD and relocate the database onto it (needs root)                        |
| `db`        | Apply migrations and seed the default print configuration                           |
| `cert [ip]` | Generate the TLS certificate (auto-detects LAN IP when omitted)                     |
| `cert:copy` | Print the `scp` command to copy the mkcert root CA to your machine                  |
| `service`   | Install and enable the `ditherbooth.service` systemd unit (needs root)              |
| `doctor`    | Check SSD mount, data symlink, Bun, cert IP, PM2 processes, and healthz             |

### Options

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| `-y, --yes`     | Assume yes for destructive prompts (non-interactive) |
| `--color=WHEN`  | `auto` (default), `always`, or `never`               |
| `--no-banner`   | Suppress the startup banner                          |
| `-h, --help`    | Show help                                            |
| `-v, --version` | Show version                                         |

### Environment overrides

| Variable             | Default                                      | Purpose                                                        |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `BOOTH_REPO`         | `/opt/dither-booth`                          | Repo root location                                             |
| `BOOTH_REPO_URL`     | `https://github.com/99stud/dither_booth.git` | Git clone URL                                                  |
| `BOOTH_SSD_DEVICE`   | auto-detected                                | Force the SSD partition (e.g. `/dev/sda1`)                     |
| `BOOTH_SERVICE_USER` | `pi`                                         | System user for the service                                    |
| `BOOTH_NO_BANNER`    | unset                                        | Disable the banner                                             |
| `NO_COLOR`           | unset                                        | Disable colored output ([no-color.org](https://no-color.org/)) |

## Development

```bash
bun run dev -- --help          # run from source
bun run --filter @dither-booth/cli check-types
bun run --filter @dither-booth/cli build   # compile arm64 + x64 into dist/
```

The compiled binary cannot derive the repo location from its own path, so the repo root is resolved from `BOOTH_REPO` or the `/opt/dither-booth` default.

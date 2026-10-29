---
title: "0009 — Booths install CI-built releases side by side"
description: "A booth downloads a tagged release bundle, unpacks it next to the running one, switches a symlink and rolls back on its own; root work runs in a unit polkit lets the admin start."
sidebar:
  order: 10
---

**A booth installs tagged releases built by CI, each in its own folder next to the one it runs, switches to it by moving the `/opt/dither-booth` symlink, and goes back on its own when it doesn't come up. The update runs as root in a systemd unit of its own, which polkit lets the service user start.**

Status: accepted, 2026-10-29

## Context

Until now a booth was a git checkout: `sudo booth repo` pulled `main`, ran `bun install` and the full build on the Pi, under the running apps, then someone restarted the service over SSH. A build that failed half way left a booth half built; a checkout once replaced the database symlink with an empty folder (#107); going back meant a manual `git checkout` and another build. Staff should update from admin, as Home Assistant and Homebridge users do, without SSH and without a developer.

## Decision

- **What a booth installs: tagged releases.** One `v*` tag releases the apps, the docs and the CLI ([Releases](/docs/development/releases/)). "Whatever `main` was" isn't something staff can choose or read release notes for.
- **Built by CI, not on the Pi.** The bundle is built on arm64 Debian Bookworm with the prebuilt native modules. The Pi downloads, checks against `SHA256SUMS` and unpacks: no compiler, a few minutes less, nothing to fail half way.
- **Side by side, one rename to switch.** Each release has its folder in `/opt/dither-booth-releases/`; `/opt/dither-booth` becomes a symlink to one of them, so every path that names it (the unit, logrotate, the dispatcher, the docs) keeps working. What a booth writes lives in `/opt/dither-booth-shared/` and on the SSD, linked into each release. The booth serves guests until the restart.
- **It checks itself and goes back.** The three PM2 processes must stay up 15 s and the engine's healthz answer, within 120 s. Otherwise the link goes back, with the database backup taken before the switch when the new release migrated it.
- **Root work in its own unit.** `booth update` runs as root in `ditherbooth-update@<version>.service`, because it restarts PM2 and so the admin that asked. polkit lets `pi` start only that unit (for a release version) and the two rollback units.
- **The release's own CLI runs it.** The update first installs the release's `booth` binary and hands over to it, so a release that changes what the CLI installs applies it itself.

### Not chosen

- **Mender, RAUC, SWUpdate.** They update whole root filesystems from A/B partitions, built as images. They would replace Raspberry Pi OS and everything `booth install` sets up (the hotspot, polkit, the network watch) for a problem that sits in one folder.
- **balena.** A different OS and a vendor's cloud for the whole fleet.
- **Building on the Pi into a new folder.** Safe to switch, but it keeps the compile on the Pi: minutes of heat, the native modules, and a build that can still fail at a venue.
- **A container per release.** Docker on the Pi, the USB printer and the camera passed through, for isolation the booth doesn't need.
- **Signed bundles.** `SHA256SUMS` catches a broken download, not a forged one. Signing fits when admin gets accounts; for now, who can push a `v*` tag is the trust boundary.

## Consequences

- A booth's first update turns its checkout into a release (`legacy-<git describe>`), kept to roll back to. `sudo booth repo` refuses on a booth that runs releases.
- Two releases and three database backups live on the booth; an update needs 1 GB free to start.
- Migrations still only go forward: a rollback across one restores the pre-update backup and loses what came after, and says so first.
- A release whose CLI changed takes effect within the same update, with no SSH step.
- Shipping to booths means tagging: `main` no longer reaches a booth by itself.

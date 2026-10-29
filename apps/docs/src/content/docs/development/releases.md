---
title: Releases
description: How a tag releases the booth software and the CLI, what the release bundle holds, and how the Hub is deployed.
sidebar:
  order: 6
---

There are two paths: a `v*` tag releases what runs on a booth, and a merge to `main` deploys the Hub.

## Booth software and the CLI: Git tags

One `v*` tag is one [release](/docs/start-here/glossary/#releases): the apps, the docs and the `booth` CLI, built from the same commit. `.github/workflows/release.yml` runs on the pushed tag:

1. **CLI binaries** (`ubuntu-latest`): builds `booth-linux-arm64` and `booth-linux-x64` with `bun run --filter @dither-booth/cli build`.
2. **Booth bundle** (`ubuntu-24.04-arm`, in a `debian:bookworm` container): builds the [release bundle](#the-release-bundle).
3. **Publish**, once both passed: one GitHub release with both binaries, `apps/cli/install.sh`, the bundle and `SHA256SUMS`, with generated release notes. A failed build publishes nothing.

A tag with a pre-release part (`v0.8.0-rc.1`) publishes a pre-release. `releases/latest` skips pre-releases, so `install.sh`, which always downloads from `releases/latest`, never picks one.

```bash
git checkout main && git pull
git tag v0.8.0
git push origin v0.8.0
```

Only repository admins can push, move or delete a `v*` tag: the **release tags** ruleset refuses anyone else ([Repository rules and security](/docs/development/repository-rules/)).

### How booths get it

Booths will install tagged releases: the booth updater, in a coming release of the CLI, downloads the bundle, checks it against `SHA256SUMS` and switches to it. Until it ships, a booth still updates from `main` with `sudo booth repo` ([Update the booth](/docs/maintenance/update-the-booth/)), so **`main` must stay deployable**: merge only what passed CI and, for hardware-facing changes, was checked on a booth.

### The release bundle

`dither-booth-<version>-linux-arm64.tar.zst` holds everything PM2 runs, laid out as in the repository, so a booth runs it from `/opt/dither-booth` as it runs a checkout today:

| Path                                                                | What                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `release.json`                                                      | `{ version, sha, builtAt }`: the release, its commit, the build time |
| `package.json`, `bun.lock`, `pm2.config.js`, `puppeteer.config.cjs` | The root files PM2 and Puppeteer read                                |
| `node_modules`, `apps/{engine,admin,shutter}/node_modules`          | Production dependencies only, with the pinned `bun`; symlinks kept   |
| `packages/`                                                         | The workspace packages, as source: the app builds import them        |
| `apps/{engine,admin,shutter}/dist`, their `package.json`            | The built apps                                                       |
| `apps/engine/drizzle`, `apps/engine/fontconfig`                     | The database migrations and the receipt viewer's font settings       |
| `apps/docs/dist`                                                    | These docs, which admin serves at `/docs/`                           |

The job builds on Debian Bookworm, on an arm64 runner. Its glibc is as old as any booth's (Raspberry Pi OS Bookworm, or Debian 13 on the booth today), and a binary built against an older glibc runs on a newer one: `bun install` there picks prebuilt `sharp` and `usb` binaries every booth can load, so the Pi never compiles. It installs with `PUPPETEER_SKIP_DOWNLOAD`: on arm64 Puppeteer uses Debian's Chromium. After the build, it reinstalls with `--production` to drop the dev dependencies, packs the bundle, then unpacks it and loads `sharp` and `usb` from it with its own `bun`. A bundle whose native modules don't load is never published.

`SHA256SUMS` lists every asset of the release. It catches a truncated or corrupt download, not a forged one: it comes from the same release.

To try a release without publishing it as the latest, push a pre-release tag (`v0.8.0-rc.1`), check that its release has the bundle and `SHA256SUMS`, then delete the release and the tag.

### Versioning

There is no version to bump in code: both the CLI and the bundle take it from the tag, without its `v` (`v0.8.0` → `0.8.0`). A tag that isn't `vX.Y.Z`, or `vX.Y.Z-` and a dot-separated pre-release (`v0.8.0-rc.1`), fails the build: booths refuse any other version (`v0.8.0-rc-1`, `v0.8.0+build`), so none is ever released.

`booth --version` is set at compile time. `apps/cli/scripts/build.ts` resolves it in this order:

1. `BOOTH_VERSION`, if set (a leading `v` is stripped).
2. The pushed tag in the release workflow (`GITHUB_REF_NAME`).
3. `git describe --tags` for local builds (`0.5.0`, or `0.5.0-3-gabc1234` past the tag).

Running from source reports `0.0.0-dev`.

The release a booth runs, which the [heartbeat](/docs/development/hub/) reports, is read once at start by `readRelease` (`packages/shared/src/server/release.ts`):

1. `version` from `release.json`, in a release bundle.
2. `git describe --tags --always` of a checkout, without the `v`.
3. `0.0.0-dev`.

### When the CLI must ship with the software

Changes to what the CLI installs — the systemd units, the polkit rule, the captive DNS, the network watch — live in the CLI. If booth software depends on them, say in the PR that booths need the new CLI, then `sudo booth network setup` or `sudo booth service`. `booth doctor` detects an out-of-date network setup.

## The Hub: merged to `main`

The [Hub](/docs/development/hub/) deploys itself, through Supabase's GitHub integration ([decision 0002](/docs/decisions/0002-hub-deploy-by-supabase/)). On every push to `main`, Supabase:

1. applies `supabase/config.toml` (`[auth]`, `[api]`, `[db]`, `[storage]`), with `[remotes.production]` in place of the local values,
2. applies the migrations it doesn't have yet,
3. deploys the Edge Functions declared in `config.toml`.

Its logs are in the `dither-hub` dashboard, under Branches. GitHub holds no Supabase credential. The integration is set up once, in the dashboard (Project Settings, Integrations, GitHub): this repository, working directory the repository root, production branch `main`, **Deploy to production** on.

It deploys as soon as a commit reaches `main`, without waiting for the Hub checks there. They run on every pull request that touches `supabase/` or `packages/protocol/`: don't merge one with a red Hub check.

A migration that reached `main` can't be taken back by a revert: write a new one that undoes it.

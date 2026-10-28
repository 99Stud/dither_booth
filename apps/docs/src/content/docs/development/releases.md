---
title: Releases
description: How the CLI is released, how booth software reaches a booth, and how the Hub is deployed.
sidebar:
  order: 6
---

There are three things to ship, on three paths.

## Booth software: `main`

The booth runs whatever `main` is when someone runs `sudo booth repo` on it ([Update the booth](/docs/maintenance/update-the-booth/)). There is no separate release: **`main` must always be deployable**. Merge only what passed CI and, for hardware-facing changes, was checked on a booth.

## The Hub: merged to `main`

The [Hub](/docs/development/hub/) deploys itself, through Supabase's GitHub integration ([decision 0002](/docs/decisions/0002-hub-deploy-by-supabase/)). On every push to `main`, Supabase:

1. applies `supabase/config.toml` (`[auth]`, `[api]`, `[db]`, `[storage]`), with `[remotes.production]` in place of the local values,
2. applies the migrations it doesn't have yet,
3. deploys the Edge Functions declared in `config.toml`.

Its logs are in the `dither-hub` dashboard, under Branches. GitHub holds no Supabase credential. The integration is set up once, in the dashboard (Project Settings, Integrations, GitHub): this repository, working directory the repository root, production branch `main`, **Deploy to production** on.

It deploys as soon as a commit reaches `main`, without waiting for the Hub checks there. They run on every pull request that touches `supabase/` or `packages/protocol/`: don't merge one with a red Hub check.

A migration that reached `main` can't be taken back by a revert: write a new one that undoes it.

## The CLI: Git tags

The `booth` binary is released by `.github/workflows/cli-release.yml` on a pushed tag `v*`:

1. Builds `booth-linux-arm64` and `booth-linux-x64` with `bun run --filter @dither-booth/cli build`.
2. Publishes a GitHub release with both binaries and `apps/cli/install.sh`, with generated release notes.

`install.sh` always downloads from `releases/latest`.

```bash
git checkout main && git pull
git tag v0.5.0
git push origin v0.5.0
```

Only repository admins can push, move or delete a `v*` tag: the **release tags** ruleset refuses anyone else ([Repository rules and security](/docs/development/repository-rules/)).

### Versioning

`booth --version` is set at compile time; there is no version to bump in code. `apps/cli/scripts/build.ts` resolves it in this order:

1. `BOOTH_VERSION`, if set (a leading `v` is stripped).
2. The pushed tag in the release workflow (`GITHUB_REF_NAME`, `v0.5.0` → `0.5.0`). A tag that isn't `vX.Y.Z` fails the build.
3. `git describe --tags` for local builds (`0.5.0`, or `0.5.0-3-gabc1234` past the tag).

Running from source reports `0.0.0-dev`.

### When the CLI must ship with the software

Changes to what the CLI installs — the systemd units, the polkit rule, the captive DNS, the network watch — live in the CLI. If booth software depends on them, tag a CLI release with the merge, and say in the PR that booths need the new CLI, then `sudo booth network setup` or `sudo booth service`. `booth doctor` detects an out-of-date network setup.

---
title: Releases
description: How the CLI is released, how booth software reaches a booth, and how the Hub is deployed.
sidebar:
  order: 5
---

There are three things to ship, on three paths.

## Booth software: `main`

The booth runs whatever `main` is when someone runs `sudo booth repo` on it ([Update the booth](/docs/maintenance/update-the-booth/)). There is no separate release: **`main` must always be deployable**. Merge only what passed CI and, for hardware-facing changes, was checked on a booth.

## The Hub: merged to `main`

The [Hub](/docs/development/hub/) deploys itself. When a change under `supabase/` or `packages/protocol/` reaches `main` and the Hub checks pass, `.github/workflows/hub-deploy.yml`:

1. links the Supabase project,
2. lists, then applies, the migrations it doesn't have yet (`supabase db push`),
3. deploys every Edge Function (`supabase functions deploy`).

Migrations go first, so a function never runs against a schema it doesn't know. One deploy runs at a time and is never cancelled halfway. To deploy `main` again by hand, run the workflow from the Actions tab.

It needs, in the `production` environment: the secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`, and the variable `SUPABASE_PROJECT_ID`. The token is a personal access token scoped to the Hub's project only, with:

| Permission                                  | Access     | For                                                                               |
| ------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| Project Settings, API Keys, API Key Secrets | Read       | `supabase link`                                                                   |
| Connection Pooling                          | Read       | the pooler URL: GitHub's runners have no IPv6, the database host has nothing else |
| Edge Functions                              | Read-write | `supabase functions deploy`                                                       |

Without Connection Pooling, `link` succeeds anyway and the migrations fail on an IPv6 address; the workflow checks for it right after linking.

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

### Versioning

`booth --version` is set at compile time; there is no version to bump in code. `apps/cli/scripts/build.ts` resolves it in this order:

1. `BOOTH_VERSION`, if set (a leading `v` is stripped).
2. The pushed tag in the release workflow (`GITHUB_REF_NAME`, `v0.5.0` → `0.5.0`). A tag that isn't `vX.Y.Z` fails the build.
3. `git describe --tags` for local builds (`0.5.0`, or `0.5.0-3-gabc1234` past the tag).

Running from source reports `0.0.0-dev`.

### When the CLI must ship with the software

Changes to what the CLI installs — the systemd units, the polkit rule, the captive DNS, the network watch — live in the CLI. If booth software depends on them, tag a CLI release with the merge, and say in the PR that booths need the new CLI, then `sudo booth network setup` or `sudo booth service`. `booth doctor` detects an out-of-date network setup.

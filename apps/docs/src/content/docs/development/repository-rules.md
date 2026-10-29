---
title: Repository rules and security
description: What GitHub enforces on the repository, and how secrets, Actions and vulnerability reports are handled.
sidebar:
  order: 10
---

The repository is public. These settings live on GitHub (Settings), not in the code, so this page is where they are written down. Change them there and here together.

## `main`

A ruleset named **main** applies to the default branch:

| Rule                                     | Effect                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Pull request required, **1 approval**    | Nobody pushes to `main`: every change is a pull request            |
| Stale approvals dismissed                | A new push to the pull request asks for a new approval             |
| Review threads resolved                  | Every review comment must be resolved before merging               |
| **Squash** only                          | One commit per pull request; its title is the pull request's title |
| Required check `Checks`, up to date      | CI must pass on the pull request merged with the latest `main`     |
| Signed commits                           | Every commit is signed; GitHub signs the squash commits it makes   |
| Linear history, no force push, no delete | `main`'s history can't be rewritten or removed                     |

**Bypass:** repository admins may merge their own pull request without an approval, through the pull request only. Nobody, admins included, can push to `main` directly.

The repository also only allows squash merging, uses the pull request's title and description for the squash commit, and deletes a branch once it is merged.

## Release tags

A ruleset named **release tags** protects `v*` tags. Only repository admins can create, move or delete one. A tag publishes a release: the `booth` CLI that booths install as root, and the release bundle booths will run ([Releases](/docs/development/releases/)).

## Secrets

- **Secret scanning** and **push protection** are on: a push containing a known secret format (API keys, tokens) is refused.
- Deploy secrets live in the **production** environment, which only `main` can deploy from. It holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the [Studio](/docs/development/studio/) deploy, and nothing else: the Hub deploys through Supabase's GitHub integration with no credential in GitHub ([decision 0002](/docs/decisions/0002-hub-deploy-by-supabase/)).

## Actions

- **Token:** a workflow's `GITHUB_TOKEN` is read-only unless the workflow asks for more in `permissions:`. Every workflow declares its permissions. Actions can't approve pull requests.
- **Allowed actions:** GitHub's own, plus `oven-sh/setup-bun`, `supabase/setup-cli`, `denoland/setup-deno`, `softprops/action-gh-release` and `cloudflare/wrangler-action`. A new third-party action needs an admin to add it in Settings → Actions → General.
- **Pinned to a commit:** every `uses:` names a full commit SHA, with the version in a comment. Dependabot (`.github/dependabot.yml`) opens a weekly pull request when they move. Once the pins are on `main`, GitHub also refuses a workflow that uses an unpinned action.
- **Outside contributors:** a workflow run from a pull request by anyone outside the team waits for a maintainer's approval.

## Dependencies and code scanning

- **Dependabot alerts and security updates** are on: a vulnerable dependency gets an alert and a pull request that bumps it.
- **CodeQL** (default setup) scans the TypeScript and the workflows on every pull request and on `main`. Its results are in the Security tab.

## Reporting a vulnerability

Private vulnerability reporting is on. [`SECURITY.md`](https://github.com/99Stud/dither_booth/blob/main/SECURITY.md) asks reporters to use the Security tab's **Report a vulnerability**, never a public issue.

## Ownership

`.github/CODEOWNERS` names who is asked to review changes to the workflows, the Hub, the CLI, `pm2.config.js`, the licence and the security policy.

## Licence

The code is published under FSL-1.1-ALv2 ([decision 0007](/docs/decisions/0007-fsl-licence/)).

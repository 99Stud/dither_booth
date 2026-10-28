---
title: Commits and pull requests
description: How commits, pull request titles and the commits they leave on main are written.
sidebar:
  order: 5
---

Every commit follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). A pull request's title follows the same rules, because it becomes the one commit the pull request leaves on `main`.

## Commits

```text
<type>(<scope>): <description>

[body]

[footers]
```

### Type

| Type       | For                                                                                |
| ---------- | ---------------------------------------------------------------------------------- |
| `feat`     | Something new staff, guests or a developer can do or see                           |
| `fix`      | Something that was wrong now works                                                 |
| `refactor` | Code that changes shape but not behaviour                                          |
| `perf`     | The same behaviour, faster or lighter                                              |
| `test`     | Tests only                                                                         |
| `docs`     | `apps/docs` only, or comments only                                                 |
| `build`    | Dependencies, build scripts, `pm2.config.js`, Turborepo                            |
| `ci`       | `.github/workflows/`                                                               |
| `chore`    | Anything else that ships nothing: tooling config, renames of untracked files       |
| `revert`   | Undoes an earlier commit: `revert: <its header>`, with `Reverts <sha>` in its body |
| `style`    | Formatting only (`bun run format:fix`)                                             |

A change that also updates the docs for its behaviour, as [Writing these docs](/docs/development/documentation/) requires, keeps its own type: `feat`, not `docs`.

### Scope

The scope is the folder the change lives in, named as in `apps/` or `packages/`:

`admin`, `cli`, `docs`, `engine`, `shutter`, `studio`, `browser-server`, `logging`, `ports`, `protocol`, `shared`, `ui`, and `hub` for `supabase/`.

Leave the scope out when a change spans several of them: `feat: the booth hides the lottery while it's off`.

### Description

- Says **what is now true**, in plain words and the [glossary](/docs/start-here/glossary/)'s terms: `feat(admin): the Draws list shows only draws`, not `feat(admin): update DrawsTable filter`.
- Starts lowercase, unless it starts with a glossary term or a name (`feat: Dither Booth mark everywhere`).
- No full stop at the end.
- The whole header is **at most 72 characters**. GitHub cuts longer subjects in lists.

### Breaking changes

A change that breaks something already deployed (a booth's database, the Hub's API, a CLI flag, a URL staff use) adds `!` before the colon and a `BREAKING CHANGE:` footer saying what to do:

```text
feat(engine)!: tickets are numbered per event

BREAKING CHANGE: run `sudo booth db` on each booth before starting it.
```

### Body and footers

- The body is optional. When present, it follows a blank line, explains why, and wraps at 72 characters.
- Footers follow a blank line: `BREAKING CHANGE: …`, `Refs #123`, `Co-authored-by: Name <email>` for a person who wrote part of it.
- **No AI attribution**: no `Co-authored-by` for an AI tool, no "Generated with" line, in a commit or a pull request.

## Pull requests

### Branch

`<type>/<short-kebab-name>` from `main`: `feat/logs-page`, `fix/printer-reconnect`, `refactor/engine-composition-root`.

### Title

The title is a commit header, by every rule above, including the **72-character limit, counting the ` (#123)` GitHub adds** when it merges. Say the change as a whole: `feat: a Logs page in admin, live from every part of the booth`.

### Description

[`.github/pull_request_template.md`](https://github.com/99Stud/dither_booth/blob/main/.github/pull_request_template.md) fills it in:

- **What changes**, for whoever reads `main`'s history.
- **Closes**: one `Closes #123` per line for each issue it finishes. GitHub only closes an issue named right after a keyword, and only once the pull request is merged into `main`. Use `Refs #123` for an issue it only touches.
- **Verified**: the checks run, and what was tried on a booth for anything touching hardware.
- **Still to verify**: what nobody could check yet. Write "Nothing" when that's true.
- **Docs**: the pages updated, or why none needed it.

Open it as a **draft** until it's ready for review.

### Merging

Merge with **Squash and merge**. `main` gets one commit per pull request:

- its title is the pull request's title, plus the ` (#123)` GitHub adds;
- its body is the pull request's **What changes**, edited down, plus the `Closes` lines and any `BREAKING CHANGE:` footer.

Check the title in the merge dialog before confirming: for a pull request with a single commit, GitHub suggests that commit's header instead.

The commits inside a pull request follow the same rules, but they don't reach `main`, so a `fixup` there is fine.

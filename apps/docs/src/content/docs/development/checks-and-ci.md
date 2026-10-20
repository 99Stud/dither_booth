---
title: Checks and CI
description: The checks every change must pass, locally and in CI.
sidebar:
  order: 4
---

Every pull request and every push to `main` runs `.github/workflows/ci.yml`. It runs the same commands you run locally, cheapest first:

```bash
bun run format       # oxfmt --check   (fix: bun run format:fix)
bun run lint         # oxlint          (fix: bun run lint:fix)
bun run check-types  # tsc in every package, through Turbo
bun run test         # bun test --isolate in every package with tests
bun run build        # production builds of shutter, admin, engine and this site
```

## Notes

- **Bun version** is pinned once, in the root `package.json` `packageManager` field. CI and the release workflow read it; locally, `bun upgrade` to match.
- **Tests run with `--isolate`**: each test file gets a fresh global object and module registry, so a `mock.module()` in one file can't leak into another. Bun before 1.3.14 ignores the flag silently.
- **CI skips Puppeteer's Chrome download** (`PUPPETEER_SKIP_DOWNLOAD`): tests mock Puppeteer and the build never launches it.
- `bun install --frozen-lockfile` in CI: commit `bun.lock` with any dependency change.

## What to test

- **Pure decisions as pure functions.** The network watch's `decideNetworkAction`, the printer maintenance policy, the ASB parser, the Experience reducer: each is a function of its inputs, unit-tested with fake time.
- **Access control.** `apps/engine/src/internal/router.test.ts` checks every procedure from the allowed and the refused side. A new procedure goes in it.
- **Migrations.** `db.migrations.test.ts` checks what drizzle-kit doesn't model, such as the stock triggers.
- **Hardware behaviour** that can't be tested in CI goes in a spec's acceptance criteria, checked on the booth.

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
bun run test         # bun test --isolate in every package with tests (admin: two passes, see below)
bun run build        # production builds of shutter, admin, engine and this site
```

Changes under `supabase/` or `packages/protocol/` also run `.github/workflows/hub.yml`: a database lint, the pgTAP tests, and `deno check` and `deno test` for the Edge Functions (see [The Hub](/docs/development/hub/)). Deno is pinned there (`2.9.0`) and runs with `--frozen`, so commit `deno.lock` with any dependency change.

## Notes

- **Bun version** is pinned once, in the root `package.json` `packageManager` field. CI and the release workflow read it; locally, `bun upgrade` to match.
- **Tests run with `--isolate`**: each test file gets a fresh global object and module registry, so a `mock.module()` in one file can't leak into another. Bun before 1.3.14 ignores the flag silently.
- **CI skips Puppeteer's Chrome download** (`PUPPETEER_SKIP_DOWNLOAD`): tests mock Puppeteer and the build never launches it.
- `bun install --frozen-lockfile` in CI: commit `bun.lock` with any dependency change.

## What to test

- **Pure decisions as pure functions.** The network watch's `decideNetworkAction`, the printer maintenance policy, the ASB parser, the Experience reducer: each is a function of its inputs, unit-tested with fake time.
- **Access control.** `apps/engine/src/internal/router.test.ts` checks every procedure from the allowed and the refused side. A new procedure goes in it.
- **Migrations.** `db.migrations.test.ts` checks what drizzle-kit doesn't model, such as the stock triggers, and that a database migrated before Drizzle v1 is taken over without re-applying anything.
- **Admin components** get render tests: see below.
- **Hardware behaviour** that can't be tested in CI goes in a spec's acceptance criteria, checked on the booth.

## Admin render tests

A render test mounts an Admin component in [happy-dom](https://github.com/capricorn86/happy-dom) and checks what it shows with [Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

1. Name the file `<Name>.render.test.tsx`, next to the component. The suffix is what gives it a DOM.
2. Import `renderWithProviders` and the queries from `#lib/test/render`. It wraps the component in the providers `main.tsx` gives every screen: the theme (light unless you pass `theme: "dark"`), React Query (a fresh client that never retries, or the `queryClient` you pass), the sidebar and tooltips. It unmounts and clears `localStorage` after each test.
   - **Router.** A component that links, or reads or writes the URL, needs `route: { path, url?, validateSearch? }`: it then renders as that route of an in-memory router, and the result's `router` gives the URL (`router.state.location.search`). Wait for it with `findBy…`.
   - **Virtual lists.** happy-dom has no layout, so `react-virtuoso` lists get a fixed viewport (`TEST_VIRTUAL_LIST_SIZE`: 40 rows of 30 px) and render only that window. Keep list tests under 40 rows.
3. Query what a user sees: `screen.getByRole`, `getByText`, or `await screen.findByText` for what arrives later.

```tsx
import { describe, expect, test } from "bun:test";

import { renderWithProviders, screen } from "#lib/test/render";

import { RarityBadge } from "./index";

describe("RarityBadge", () => {
  test("prefixes the label with the count", () => {
    renderWithProviders(<RarityBadge rarity="common" count={19} />);

    expect(screen.getByText("19")).toBeDefined();
  });
});
```

The Admin's `bun run test` runs two passes. `test:unit` runs every other test file on Bun's own globals. `test:render` runs the `*.render.test.tsx` files with `src/lib/test/dom-environment.tsx` preloaded. The split is deliberate. happy-dom replaces `fetch`, `Response`, `WebSocket` and other globals, which breaks the route and server tests, so it can't be preloaded for every file. It can't be imported by the test either: Bun loads CommonJS packages such as React DOM and Testing Library before the test's own imports run, so they would start without a DOM.

Run one render test from `apps/admin` with the preload:

```bash
bun test --isolate --preload ./src/lib/test/dom-environment.tsx RarityBadge.render
```

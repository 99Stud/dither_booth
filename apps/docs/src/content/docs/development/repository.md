---
title: Repository and packages
description: Monorepo layout, package boundaries, and the conventions every package follows.
sidebar:
  order: 3
---

A Bun workspace orchestrated by Turborepo. Apps in `apps/*`, shared code in `packages/*`.

## Apps

| App            | Stack                                                      | Entry                                            |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `apps/engine`  | Bun, tRPC, Drizzle + SQLite, Puppeteer, Sharp, `usb`       | `src/server.ts` (dev), `src/production-entry.ts` |
| `apps/shutter` | React, TanStack Router, three.js shaders, Bun HTML imports | same                                             |
| `apps/admin`   | React, TanStack Router                                     | same                                             |
| `apps/cli`     | Citty, Clack, `bun build --compile`                        | `src/index.ts`                                   |
| `apps/docs`    | Astro Starlight                                            | `src/content/docs/`                              |
| `apps/studio`  | React, Bun HTML imports, supabase-js, a service worker     | `src/index.html`, `src/sw/sw.ts`                 |
| `supabase`     | Postgres migrations, RLS tests, local stack config         | `migrations/`, `tests/database/`                 |

## Engine layout

```
apps/engine/src/
  domains/<domain>/
    index.ts                  # the domain's procedures, as exported to the router
    <domain>.service.ts       # what other domains may import
    queries/ mutations/ subscriptions/   # one tRPC procedure per file
    internal/                 # everything else, private to the domain
  internal/router.ts          # the router, grouped by caller
  internal/trpc.ts            # base procedures and their access checks
  db/                         # schema, migrations runner, seeds
  lib/                        # cross-domain infrastructure (Puppeteer, server, process manager)
  drizzle/                    # SQL migrations, one folder each
```

A domain imports another only through its `*.service.ts`.

## Package rules

Packages make their public API explicit and their runtime constraints visible from paths.

**Public API = `package.json` `exports`.** Other packages import only exported subpaths. Prefer explicit subpaths and filenames; avoid catch-all `index.ts` re-exports.

```ts
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/routes"; // good
import { RECEIPT_VIEWER_PATH } from "@dither-booth/shared/src/routes"; // never
```

**Private aliases = `package.json` `imports`** (`#internal/*`, `#server/*`…), valid only inside the package. Prefer scoped aliases over a broad `#*`.

**No `tsconfig` `paths`** to fake workspace imports: it's TypeScript-only and bypasses package metadata. Need a module from another package → add an `exports` entry.

**Runtime scopes:**

| Directory          | May use                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `src/isomorphic/*` | Nothing runtime-specific: no DOM, no Bun, no Node built-ins, no env |
| `src/browser/*`    | DOM, `localStorage`, canvas, `Blob`, `window`                       |
| `src/server/*`     | Bun, Node built-ins, filesystem, env, startup validation            |
| `src/internal/*`   | Implementation helpers, never exported                              |

Exports reflect the scope: `./formatting` → `src/isomorphic/formatting.ts`, `./browser/blob`, `./server/runtime`. Each scope typechecks with the narrowest globals (isomorphic without DOM or Bun, browser without Bun, server without DOM).

**Adding a module to a package:**

1. Public or private?
2. Isomorphic, browser or server?
3. Put it in the matching directory with an explicit filename.
4. Add an `exports` entry only if another package imports it.
5. Use `imports` aliases inside the package.
6. Update consumers to the public subpath.
7. Run the package's lint, format and typecheck.

## Shared packages

| Package                           | Holds                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dither-booth/shared`            | Schemas and types crossing app boundaries: kiosk commands, printer status, lottery, kits, healthz payloads, network helpers, routes, the booth's systemd unit names and PM2 log folder (`./booth-system`)       |
| `@dither-booth/protocol`          | What a booth and the Hub say to each other: runtime-agnostic Zod schemas (zod only), read by Bun and by Deno, with fixtures                                                                                     |
| `@dither-booth/ports`             | Ports, bind hosts, origins, the TLS manifest, allowed hostnames                                                                                                                                                 |
| `@dither-booth/browser-server`    | The Bun HTTPS server for Shutter and admin: static manifest, cache headers, SPA fallback, `/engine/trpc` proxy, `POST /client-log` (browser reports); and their production build, which inlines imported images |
| `@dither-booth/logging`           | `logKioskEvent` (one JSON line per server event, secrets redacted), error diagnostics, and the browser report schema and limits (`./client-log`)                                                                |
| `@dither-booth/ui`                | Shared React components                                                                                                                                                                                         |
| `@dither-booth/typescript-config` | Base `tsconfig`s                                                                                                                                                                                                |

## Vocabulary

Names in code, UI and docs follow the [Glossary](/docs/start-here/glossary/). A new concept gets a glossary entry before it gets three names.

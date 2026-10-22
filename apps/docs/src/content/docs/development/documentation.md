---
title: Writing these docs
description: Where each kind of page goes, the house style, and the rule that every feature updates the docs.
sidebar:
  order: 6
---

This site is the booth's single source of documentation. App READMEs only point here.

## The rule

**Every change that adds or changes behaviour updates these docs in the same pull request.** A feature isn't done until the page that staff, a maintainer or a developer would look for says what it does now. A PR that changes behaviour and no page is incomplete.

Ask, for every change:

| If the change…                                                       | Update                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| changes what staff see or do at a venue                              | `venue/`                                                        |
| changes setup, health checks, recovery or a failure mode             | `maintenance/` (troubleshooting rows especially)                |
| changes provisioning or the hardware                                 | `build/`, `reference/cli.md`, `reference/files-and-services.md` |
| changes how a part works, its timings or its guarantees              | `architecture/`                                                 |
| adds or changes a procedure, port, env var, setting, file or service | `reference/`                                                    |
| introduces a new term                                                | `start-here/glossary.md`                                        |
| takes a significant, hard-to-reverse decision                        | a new `decisions/NNNN-….md`                                     |

Pure refactors with no behaviour change need no doc change, but check that file paths and names cited in the docs still exist.

## Where pages go

The sidebar follows the reader's situation ([Diátaxis](https://diataxis.fr/)):

| Section                  | Reader                          | Kind                                       |
| ------------------------ | ------------------------------- | ------------------------------------------ |
| **At the venue**         | Staff on site, on a phone       | Step-by-step guides. No code, no internals |
| **Build a booth**        | Whoever assembles a new booth   | Procedures                                 |
| **Maintenance**          | Whoever keeps booths running    | Runbooks and symptom → fix tables          |
| **How it works**         | Developers, curious maintainers | Explanation: mechanisms, timings, why      |
| **Decisions**, **Specs** | Developers                      | ADRs and design specs                      |
| **Reference**            | Everyone                        | Exhaustive, dry tables                     |
| **Development**          | Developers                      | Setup and conventions                      |

Pages live in `apps/docs/src/content/docs/<section>/`. The sidebar is generated from the folders; order pages with `sidebar.order` in the frontmatter.

## Style

- **Write for the reader's situation.** Venue pages are read standing next to the booth: short steps, the exact button labels, what you'll see next.
- **Use the glossary's words**, especially its _avoid_ lists in staff-facing pages (“booth Wi-Fi”, not “hotspot”).
- **Be exact.** Real timings (“3 s”, “45 s”), real paths, real commands, real labels. If the code says it, the page says the same thing.
- **Say why** in architecture pages: the constraint or measurement behind each rule.
- **Tables for lookups, steps for procedures, prose for explanations.**
- **One fact, one place.** Link instead of copying; reference pages hold the full lists.
- Use [Starlight components](https://starlight.astro.build/components/using-components/) in `.mdx` pages (`Steps`, `Aside`, `Card`), and ` ```mermaid ` blocks for diagrams.

## Run it

```bash
bun run docs:dev     # http://localhost:4321/docs/, hot reload
bun run docs:build   # static site in apps/docs/dist, with search
```

The site is built with the base path `/docs` and is fully static, search included (Pagefind). The root `bun run build` builds it, and the **admin server serves it at `/docs/`**: on a booth, `https://<hostname>.local:3002/docs/`, linked from admin's sidebar, and from Settings on a phone. Every booth therefore carries the docs matching its software, offline.

Internal links include the base: write `[Wi-Fi](/docs/venue/wifi/)`, not `/venue/wifi/`.

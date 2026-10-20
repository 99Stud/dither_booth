<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "working on the engine router or adding new backend procedures"
  load: "apps/engine/node_modules/@trpc/server/skills/server-setup/SKILL.md"
- task: "adding or changing validation for API inputs and outputs"
  load: "apps/engine/node_modules/@trpc/server/skills/validators/SKILL.md"
- task: "sending blobs, files, or other non-JSON data between shutter and engine"
  load: "apps/engine/node_modules/@trpc/server/skills/non-json-content-types/SKILL.md"
- task: "changing the frontend tRPC client, links, or request behavior"
  load: "apps/shutter/node_modules/@trpc/client/skills/links/SKILL.md"
- task: "working on navigation, route loaders, or URL state in the shutter app" # To load this skill, run: npx @tanstack/intent@latest list | grep data-loading
<!-- intent-skills:end -->

# Documentation

The docs site in `apps/docs` (Astro Starlight, pages in `apps/docs/src/content/docs/`) is the only documentation. App READMEs only point to it. The root build builds it and the admin server serves it at `/docs/`, so staff read it on the booth. Internal links include that base: `/docs/venue/wifi/`.

Every change that adds or changes behaviour updates the docs in the same change. The work isn't done until the pages describe the new behaviour. Before you finish:

1. Read `apps/docs/src/content/docs/development/documentation.md`. Its table maps each kind of change to the section that must change.
2. Update every page that states something your change made false: timings, labels, commands, paths, procedures, troubleshooting rows. Search the docs for the names you touched (`grep -rn <name> apps/docs/src/content/docs`).
3. Add new procedures, env vars, ports, settings, files and services to the matching `reference/` page. Add new terms to `start-here/glossary.md`. Record significant, hard-to-reverse decisions as a new `decisions/NNNN-*.md`.
4. Run `bun run docs:build`. It must pass.

Write venue pages for staff on site: exact button labels, short steps, no internals. Write architecture pages for developers: the mechanism, the exact numbers, and why. Use the glossary's terms.

Pure refactors need no doc change, unless a doc names a file, symbol or path you moved or renamed. Then fix the reference.

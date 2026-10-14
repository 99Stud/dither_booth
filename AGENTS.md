<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "working on the engine router or adding new backend procedures"
  load: "apps/engine/node_modules/@trpc/server/skills/server-setup/SKILL.md"
- task: "adding or changing validation for API inputs and outputs"
  load: "apps/engine/node_modules/@trpc/server/skills/validators/SKILL.md"
- task: "sending blobs, files, or other non-JSON data between web and engine"
  load: "apps/engine/node_modules/@trpc/server/skills/non-json-content-types/SKILL.md"
- task: "changing the frontend tRPC client, links, or request behavior"
  load: "apps/shutter/node_modules/@trpc/client/skills/links/SKILL.md"
- task: "working on navigation, route loaders, or URL state in the web app" # To load this skill, run: npx @tanstack/intent@latest list | grep data-loading
<!-- intent-skills:end -->

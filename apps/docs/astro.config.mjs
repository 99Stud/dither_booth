import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";
import { defineConfig } from "astro/config";

// Static site, search built at build time (Pagefind): admin serves `dist/` at
// /docs on the booth, with no network needed.
export default defineConfig({
  base: "/docs",
  trailingSlash: "always",
  vite: {
    // Starlight's components load Sätteri, whose native binding is an optional
    // platform package. Bundled, it resolves that package from dist/, where
    // Bun's isolated install doesn't link it.
    environments: { prerender: { resolve: { external: ["satteri"] } } },
  },
  integrations: [
    // Must come before Starlight, which processes the same Markdown.
    mermaid({ autoTheme: true }),
    starlight({
      title: "Dither Booth",
      description:
        "Field guide, maintenance runbooks and architecture of the Dither Booth photo kiosk.",
      editLink: {
        baseUrl: "https://github.com/99Stud/dither_booth/edit/main/apps/docs/",
      },
      lastUpdated: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/99Stud/dither_booth",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [{ autogenerate: { directory: "start-here" } }],
        },
        {
          label: "At the venue",
          items: [{ autogenerate: { directory: "venue" } }],
        },
        {
          label: "Build a booth",
          items: [{ autogenerate: { directory: "build" } }],
        },
        {
          label: "Maintenance",
          items: [{ autogenerate: { directory: "maintenance" } }],
        },
        {
          label: "How it works",
          items: [{ autogenerate: { directory: "architecture" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
        {
          label: "Development",
          items: [{ autogenerate: { directory: "development" } }],
        },
        {
          label: "Decisions",
          items: [{ autogenerate: { directory: "decisions" } }],
        },
        { label: "Specs", items: [{ autogenerate: { directory: "specs" } }] },
      ],
    }),
  ],
});

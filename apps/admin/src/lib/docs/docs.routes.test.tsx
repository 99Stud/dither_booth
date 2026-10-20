import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDocsRoutes } from "./docs.routes";

let workDir: string;
let docsRoot: string;

const request = async (path: string, root = docsRoot) => {
  const routes = createDocsRoutes(root);
  const handler = path === "/docs" ? routes["/docs"] : routes["/docs/*"];
  const response = await handler!(new Request(`https://booth.local${path}`));
  return response!;
};

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "docs-routes-"));
  docsRoot = join(workDir, "dist");
  await mkdir(join(docsRoot, "venue", "wifi"), { recursive: true });
  await mkdir(join(docsRoot, "_astro"), { recursive: true });
  await writeFile(join(docsRoot, "index.html"), "home");
  await writeFile(join(docsRoot, "404.html"), "missing");
  await writeFile(join(docsRoot, "venue", "wifi", "index.html"), "wifi");
  await writeFile(join(docsRoot, "_astro", "app.abc123.css"), "css");
  await writeFile(join(workDir, "secret.txt"), "secret");
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("createDocsRoutes", () => {
  it("redirects /docs to /docs/", async () => {
    const response = await request("/docs");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/docs/");
  });

  it("serves the home page and pages by their directory", async () => {
    expect(await (await request("/docs/")).text()).toBe("home");

    const page = await request("/docs/venue/wifi/");
    expect(page.status).toBe(200);
    expect(await page.text()).toBe("wifi");
    expect(page.headers.get("cache-control")).toBe("no-cache");
  });

  it("adds the trailing slash to a page directory", async () => {
    const response = await request("/docs/venue/wifi?x=1");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/docs/venue/wifi/?x=1");
  });

  it("caches fingerprinted assets for good", async () => {
    const response = await request("/docs/_astro/app.abc123.css");
    expect(await response.text()).toBe("css");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("answers unknown pages with the site's 404 page", async () => {
    const response = await request("/docs/nope/");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("missing");
  });

  it("never serves files outside the docs build", async () => {
    for (const path of ["/docs/../secret.txt", "/docs/%2e%2e/secret.txt"]) {
      const response = await request(path);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toBe("secret");
    }
  });

  it("says how to build the docs when they aren't built", async () => {
    const response = await request("/docs/", join(workDir, "absent"));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("docs:build");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getAppRootFromImportMetaUrl } from "./paths";

let root: string;
let app: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "paths-"));
  app = join(root, "apps", "engine");
  await mkdir(join(app, "src", "lib"), { recursive: true });
  await mkdir(join(app, "dist"), { recursive: true });
  await writeFile(join(app, "package.json"), "{}");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const urlOf = (...parts: string[]) => pathToFileURL(join(...parts)).href;

describe("getAppRootFromImportMetaUrl", () => {
  test("a source module finds its app", () => {
    expect(
      getAppRootFromImportMetaUrl(urlOf(app, "src", "lib", "constants.ts")),
    ).toBe(app);
  });

  test("a bundle finds the same app", () => {
    expect(getAppRootFromImportMetaUrl(urlOf(app, "dist", "server.js"))).toBe(
      app,
    );
  });

  test("a module outside any package throws", () => {
    expect(() => getAppRootFromImportMetaUrl(urlOf(root, "loose.js"))).toThrow(
      "No package.json above",
    );
  });
});

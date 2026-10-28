import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBrowserServerApp } from "./index";

// 1×1 PNG, the smallest image that can stand in for a ticket's mask.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const originalCwd = process.cwd();
let appRoot: string | undefined;

afterEach(async () => {
  process.chdir(originalCwd);

  if (appRoot) {
    await rm(appRoot, { recursive: true, force: true });
    appRoot = undefined;
  }
});

/** A browser app the way Shutter is laid out: a server entry that imports the page. */
async function writeApp(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dither-booth-build-"));
  await mkdir(join(root, "src"), { recursive: true });
  await Bun.write(
    join(root, "src/production-entry.ts"),
    'import index from "./index.html";\nconsole.log(index);\n',
  );
  await Bun.write(
    join(root, "src/index.html"),
    '<!doctype html><html><body><script type="module" src="./client.ts"></script></body></html>\n',
  );
  await Bun.write(
    join(root, "src/client.ts"),
    // Upper case: the build must not care how the file is named.
    'import mask from "./mask.PNG";\ndocument.body.textContent = mask;\n',
  );
  await Bun.write(
    join(root, "src/mask.PNG"),
    Buffer.from(PNG_BASE64, "base64"),
  );

  return root;
}

describe("buildBrowserServerApp", () => {
  it("inlines an image the browser bundle imports, so no URL can miss it", async () => {
    appRoot = await writeApp();
    process.chdir(appRoot);

    await buildBrowserServerApp();

    const buildAssets = (await Bun.file(
      join(appRoot, "dist/build-assets.json"),
    ).json()) as string[];
    const clientBundle = buildAssets.find(
      (path) => path.startsWith("assets/index-") && path.endsWith(".js"),
    );

    expect(clientBundle).toBeDefined();
    expect(buildAssets.some((path) => /\.png$/iu.test(path))).toBe(false);

    const bundle = await readFile(join(appRoot, "dist", clientBundle!), "utf8");

    expect(bundle).toContain(`data:image/png;base64,${PNG_BASE64}`);
  });
});

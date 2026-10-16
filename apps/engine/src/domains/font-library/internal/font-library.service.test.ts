import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { campaignTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import {
  createEventForDb,
  getKitForDb,
} from "#domains/event/internal/event.service";

import {
  deleteFontAsset,
  installLibraryFont,
  listFontAssets,
  readFontAsset,
  resetFontLibraryCatalog,
  searchFontLibrary,
  uploadFont,
} from "./font-library.service";

const woff2 = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("wOF2"));
  return bytes;
};

const CATALOG = [
  {
    id: "creepster",
    family: "Creepster",
    category: "display",
    subsets: ["latin"],
    weights: [400],
    styles: ["normal"],
    license: "OFL-1.1",
    type: "google",
  },
  {
    id: "noto-sans-jp",
    family: "Noto Sans JP",
    category: "sans-serif",
    subsets: ["japanese"],
    weights: [400],
    styles: ["normal"],
    license: "OFL-1.1",
    type: "google",
  },
  {
    id: "inter",
    family: "Inter",
    category: "sans-serif",
    subsets: ["latin"],
    weights: [100, 400, 700, 900],
    styles: ["normal"],
    license: "OFL-1.1",
    type: "google",
  },
];

const detail = (
  id: string,
  family: string,
  weights: number[],
  host = "cdn.jsdelivr.net",
) => ({
  id,
  family,
  license: "OFL-1.1",
  weights,
  variants: Object.fromEntries(
    weights.map((weight) => [
      String(weight),
      {
        normal: {
          latin: {
            url: {
              woff2: `https://${host}/fontsource/fonts/${id}@latest/latin-${weight}-normal.woff2`,
            },
          },
        },
      },
    ]),
  ),
});

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return route();
  };
  return { fn, calls };
}

async function withDeps(
  run: (deps: {
    db: ReturnType<typeof createTestDb>["db"];
    fontsDir: string;
  }) => Promise<void>,
) {
  const { db, sqlite } = createTestDb();
  const fontsDir = await mkdtemp(join(tmpdir(), "fonts-"));
  try {
    await run({ db, fontsDir });
  } finally {
    sqlite.close();
    await rm(fontsDir, { recursive: true, force: true });
  }
}

describe("searchFontLibrary", () => {
  test("lists latin Google fonts by name, fetching the catalogue once", async () => {
    resetFontLibraryCatalog();
    const { fn, calls } = fakeFetch({
      "https://api.fontsource.org/v1/fonts": () => Response.json(CATALOG),
    });
    expect(
      (await searchFontLibrary({ fetch: fn }, "")).map((f) => f.id),
    ).toEqual(["creepster", "inter"]);
    expect(
      (await searchFontLibrary({ fetch: fn }, "CREEP")).map((f) => f.id),
    ).toEqual(["creepster"]);
    expect(calls).toHaveLength(1);
  });

  test("says the booth is offline when it can't reach Google Fonts", async () => {
    resetFontLibraryCatalog();
    const fn = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(searchFontLibrary({ fetch: fn }, "")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });
});

describe("installLibraryFont", () => {
  test("stores the nearest regular and bold weights and serves them back", async () => {
    await withDeps(async ({ db, fontsDir }) => {
      const { fn } = fakeFetch({
        "https://api.fontsource.org/v1/fonts/inter": () =>
          Response.json(detail("inter", "Inter", [100, 400, 700, 900])),
        "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2":
          () => new Response(woff2()),
        "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.woff2":
          () => new Response(woff2()),
      });
      const asset = await installLibraryFont(
        { db, fontsDir, fetch: fn },
        "inter",
      );
      expect(asset).toMatchObject({
        family: "Inter",
        source: "fontsource",
        license: "OFL-1.1",
        weights: [400, 700],
      });
      expect(await readdir(join(fontsDir, asset.id))).toEqual([
        "400-normal.woff2",
        "700-normal.woff2",
      ]);
      const served = await readFontAsset({ db, fontsDir }, asset.id);
      expect(served.files.map((file) => file.weight)).toEqual([400, 700]);
      expect(atob(served.files[0]!.base64).startsWith("wOF2")).toBe(true);
    });
  });

  test("refuses a file from another host, or one that isn't woff2", async () => {
    await withDeps(async ({ db, fontsDir }) => {
      const elsewhere = fakeFetch({
        "https://api.fontsource.org/v1/fonts/creepster": () =>
          Response.json(
            detail("creepster", "Creepster", [400], "evil.example"),
          ),
      });
      await expect(
        installLibraryFont({ db, fontsDir, fetch: elsewhere.fn }, "creepster"),
      ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
      expect(elsewhere.calls.some((url) => url.includes("evil.example"))).toBe(
        false,
      );

      const notAFont = fakeFetch({
        "https://api.fontsource.org/v1/fonts/creepster": () =>
          Response.json(detail("creepster", "Creepster", [400])),
        "https://cdn.jsdelivr.net/fontsource/fonts/creepster@latest/latin-400-normal.woff2":
          () => new Response("<html>"),
      });
      await expect(
        installLibraryFont({ db, fontsDir, fetch: notAFont.fn }, "creepster"),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(listFontAssets({ db })).toEqual([]);
      expect(await readdir(fontsDir)).toEqual([]);
    });
  });
});

describe("uploadFont", () => {
  test("accepts a woff2 up to 2 MB, and nothing else", async () => {
    await withDeps(async ({ db, fontsDir }) => {
      const asset = await uploadFont(
        { db, fontsDir },
        { family: "Client Sans", weight: 400, bytes: woff2() },
      );
      expect(asset).toMatchObject({
        family: "Client Sans",
        source: "upload",
        weights: [400],
      });
      await expect(
        uploadFont(
          { db, fontsDir },
          { family: "x", weight: 400, bytes: new Uint8Array(64) },
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        uploadFont(
          { db, fontsDir },
          { family: "x", weight: 400, bytes: woff2(3 * 1024 * 1024) },
        ),
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    });
  });
});

describe("deleteFontAsset and the kit", () => {
  test("a font the event uses can't be removed; a missing one falls back to the kit's", async () => {
    await withDeps(async ({ db, fontsDir }) => {
      await createEventForDb(db, {
        name: "Halloween",
        kitId: "tartines",
        noWinWeight: 50,
        winCooldownMinutes: 5,
        printLoserTicket: false,
        enabled: false,
      });
      const asset = await uploadFont(
        { db, fontsDir },
        { family: "Client Sans", weight: 400, bytes: woff2() },
      );
      db.update(campaignTable)
        .set({ kitSettings: { fonts: { body: `asset:${asset.id}` } } })
        .run();

      expect((await getKitForDb(db)).fonts.body).toBe(`asset:${asset.id}`);
      await expect(
        deleteFontAsset({ db, fontsDir }, asset.id),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      db.update(campaignTable).set({ kitSettings: {} }).run();
      await deleteFontAsset({ db, fontsDir }, asset.id);
      expect(listFontAssets({ db })).toEqual([]);
      expect(await readdir(fontsDir)).toEqual([]);

      // A stored role pointing at a removed font uses the kit's font again.
      db.update(campaignTable)
        .set({ kitSettings: { fonts: { body: `asset:${asset.id}` } } })
        .run();
      expect((await getKitForDb(db)).fonts.body).toBe("ibm-plex-sans");
    });
  });
});

import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { campaignTable } from "#db/internal/db.schema";
import { createTestDb } from "#db/internal/db.test-utils";
import {
  createEventForDb,
  getKitForDb,
} from "#domains/event/internal/event.service";

import {
  deleteLogoAsset,
  listLogoAssets,
  readLogoAsset,
  uploadLogo,
} from "./logo-library.service";

async function withDeps(
  run: (deps: {
    db: ReturnType<typeof createTestDb>["db"];
    logosDir: string;
  }) => Promise<void>,
) {
  const { db, sqlite } = createTestDb();
  const logosDir = await mkdtemp(join(tmpdir(), "logos-"));
  try {
    await run({ db, logosDir });
  } finally {
    sqlite.close();
    await rm(logosDir, { recursive: true, force: true });
  }
}

/** A light grey margin around a red block and a pale yellow block. */
const colourPng = async () =>
  new Uint8Array(
    await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: "#f4f4f4",
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 200,
              height: 300,
              channels: 3,
              background: "#c0392b",
            },
          },
          left: 100,
          top: 50,
        },
        {
          input: {
            create: {
              width: 200,
              height: 300,
              channels: 3,
              background: "#fff3b0",
            },
          },
          left: 300,
          top: 50,
        },
      ])
      .png()
      .toBuffer(),
  );

const svg = (body: string) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20">${body}</svg>`,
  );

const pixels = async (base64: string) => {
  const { data, info } = await sharp(Buffer.from(base64, "base64"))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { values: new Set(data), info };
};

const createEvent = (db: ReturnType<typeof createTestDb>["db"]) =>
  createEventForDb(db, {
    name: "Halloween",
    kitId: "tartines",
    noWinWeight: 50,
    winCooldownMinutes: 5,
    printLoserTicket: false,
    enabled: false,
  });

describe("logo library", () => {
  test("a colour PNG is kept as it prints: trimmed, black and white, at most 144 px tall", async () => {
    await withDeps(async ({ db, logosDir }) => {
      const asset = await uploadLogo(
        { db, logosDir },
        { name: "Client", bytes: await colourPng() },
      );
      const stored = await readLogoAsset({ db, logosDir }, asset.id);
      const { values, info } = await pixels(stored.base64);

      expect(listLogoAssets({ db })).toEqual([asset]);
      // The pale block prints white, so it is trimmed with the grey margin.
      expect(info.height).toBe(144);
      expect(info.width).toBe(96);
      expect(stored).toMatchObject({ width: 96, height: 144 });
      expect([...values].every((value) => value === 0 || value === 255)).toBe(
        true,
      );
    });
  });

  test("an SVG is drawn to a PNG; the SVG itself is never kept", async () => {
    await withDeps(async ({ db, logosDir }) => {
      const asset = await uploadLogo(
        { db, logosDir },
        { name: "Mark", bytes: svg('<rect width="100" height="20"/>') },
      );
      const stored = await readLogoAsset({ db, logosDir }, asset.id);

      expect(stored.height).toBe(144);
      expect(stored.width).toBe(720);
      expect(await readdir(logosDir)).toEqual([`${asset.id}.png`]);
    });
  });

  test("refuses anything that isn't a PNG or an SVG, or is over 2 MB, and keeps nothing", async () => {
    await withDeps(async ({ db, logosDir }) => {
      const jpeg = new Uint8Array(
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#000" },
        })
          .jpeg()
          .toBuffer(),
      );
      const html = new TextEncoder().encode("<html><svg></svg></html>");
      const huge = new Uint8Array(3 * 1024 * 1024);
      huge.set(await colourPng());

      for (const bytes of [jpeg, html]) {
        await expect(
          uploadLogo({ db, logosDir }, { name: "x", bytes }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }
      await expect(
        uploadLogo({ db, logosDir }, { name: "x", bytes: huge }),
      ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      // A blank image has nothing to print.
      await expect(
        uploadLogo({ db, logosDir }, { name: "x", bytes: svg("") }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(listLogoAssets({ db })).toEqual([]);
      expect(await readdir(logosDir)).toEqual([]);
    });
  });

  test("a logo the event prints can't be removed; a missing one drops out of the row", async () => {
    await withDeps(async ({ db, logosDir }) => {
      await createEvent(db);
      const asset = await uploadLogo(
        { db, logosDir },
        { name: "Client", bytes: await colourPng() },
      );
      db.update(campaignTable)
        .set({ kitSettings: { partners: [asset.id] } })
        .run();

      expect((await getKitForDb(db)).partners).toEqual([asset.id]);
      await expect(
        deleteLogoAsset({ db, logosDir }, asset.id),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      db.update(campaignTable).set({ kitSettings: {} }).run();
      await deleteLogoAsset({ db, logosDir }, asset.id);
      expect(listLogoAssets({ db })).toEqual([]);
      expect(await readdir(logosDir)).toEqual([]);

      // A stored partner pointing at a removed logo is left out of the row.
      db.update(campaignTable)
        .set({ kitSettings: { partners: [asset.id] } })
        .run();
      expect((await getKitForDb(db)).partners).toEqual([]);
    });
  });
});

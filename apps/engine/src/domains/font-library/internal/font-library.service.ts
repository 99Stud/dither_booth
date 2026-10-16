import {
  FONT_ROLES,
  parseFontAssetRef,
  type FontRole,
  type KitFontRef,
} from "@dither-booth/shared/kit-fonts";
import { readKitSettings, type KitSettings } from "@dither-booth/shared/kits";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import z from "zod";

import type { DB } from "#db/internal/db.types";

import {
  campaignTable,
  fontAssetTable,
  type FontAssetFile,
} from "#db/internal/db.schema";

import {
  FONT_DOWNLOAD_HOSTS,
  FONT_SEARCH_LIMIT,
  FONTSOURCE_API,
  LIBRARY_FONT_WEIGHTS,
  MAX_FONT_FILE_BYTES,
  WOFF2_SIGNATURE,
} from "./font-library.constants";

type Fetch = (input: string) => Promise<Response>;

export type FontLibraryDeps = {
  db: DB;
  fontsDir: string;
  fetch?: Fetch;
};

export type FontAsset = {
  id: string;
  family: string;
  source: "fontsource" | "upload";
  license: string;
  weights: number[];
};

const fontsourceListSchema = z.array(
  z.object({
    id: z.string(),
    family: z.string(),
    category: z.string(),
    subsets: z.array(z.string()),
    weights: z.array(z.number()),
    styles: z.array(z.string()),
    license: z.string(),
    type: z.string(),
  }),
);

const fontsourceDetailSchema = z.object({
  id: z.string(),
  family: z.string(),
  license: z.string(),
  weights: z.array(z.number()),
  variants: z.record(
    z.string(),
    z.record(
      z.string(),
      z.record(z.string(), z.object({ url: z.object({ woff2: z.string() }) })),
    ),
  ),
});

export type FontLibraryEntry = {
  id: string;
  family: string;
  category: string;
  license: string;
};

let catalog: Promise<z.infer<typeof fontsourceListSchema>> | null = null;

const offline = (cause: unknown) =>
  new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message:
      "The booth can't reach Google Fonts. Connect it to the internet to add a font.",
    cause,
  });

async function fetchJson(fetchFn: Fetch, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok) {
    throw new TRPCError({
      code: response.status === 404 ? "NOT_FOUND" : "BAD_GATEWAY",
      message: `Google Fonts answered ${response.status}.`,
    });
  }
  return await response.json();
}

/** The Google Fonts catalogue (latin), fetched once per engine run. */
export async function searchFontLibrary(
  { fetch: fetchFn = fetch }: Pick<FontLibraryDeps, "fetch">,
  query: string,
): Promise<FontLibraryEntry[]> {
  catalog ??= fetchJson(fetchFn, FONTSOURCE_API)
    .then((json) => fontsourceListSchema.parse(json))
    .catch((error) => {
      catalog = null;
      throw error;
    });
  const needle = query.trim().toLowerCase();
  return (await catalog)
    .filter(
      (font) =>
        font.type === "google" &&
        font.subsets.includes("latin") &&
        font.styles.includes("normal") &&
        (needle === "" || font.family.toLowerCase().includes(needle)),
    )
    .slice(0, FONT_SEARCH_LIMIT)
    .map(({ id, family, category, license }) => ({
      id,
      family,
      category,
      license,
    }));
}

/** Only for tests: forget the cached catalogue. */
export function resetFontLibraryCatalog() {
  catalog = null;
}

function assertWoff2(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_FONT_FILE_BYTES) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "That font file is over 2 MB.",
    });
  }
  const signature = new TextDecoder().decode(bytes.subarray(0, 4));
  if (signature !== WOFF2_SIGNATURE) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That file is not a woff2 font.",
    });
  }
}

async function download(fetchFn: Fetch, url: string): Promise<Uint8Array> {
  const host = new URL(url).hostname;
  if (!FONT_DOWNLOAD_HOSTS.some((allowed) => allowed === host)) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `Refusing to download a font from ${host}.`,
    });
  }
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: `The font file answered ${response.status}.`,
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertWoff2(bytes);
  return bytes;
}

function toAsset(row: typeof fontAssetTable.$inferSelect): FontAsset {
  return {
    id: row.id,
    family: row.family,
    source: row.source,
    license: row.license,
    weights: [...new Set(row.files.map((file) => file.weight))].toSorted(),
  };
}

async function storeFont(
  { db, fontsDir }: FontLibraryDeps,
  font: {
    family: string;
    source: FontAsset["source"];
    license: string;
    files: { weight: number; bytes: Uint8Array }[];
  },
): Promise<FontAsset> {
  // Paths are made from a generated id, never from a name a user typed.
  const id = createId();
  const files: FontAssetFile[] = font.files.map(({ weight }) => ({
    weight,
    style: "normal",
    path: `${id}/${weight}-normal.woff2`,
  }));
  await mkdir(join(fontsDir, id), { recursive: true });
  try {
    await Promise.all(
      font.files.map(({ bytes }, index) =>
        writeFile(join(fontsDir, files[index]!.path), bytes),
      ),
    );
    const row = db
      .insert(fontAssetTable)
      .values({
        id,
        family: font.family,
        source: font.source,
        license: font.license,
        files,
      })
      .returning()
      .get();
    return toAsset(row);
  } catch (error) {
    await rm(join(fontsDir, id), { recursive: true, force: true });
    throw error;
  }
}

/**
 * Downloads a Google font's latin woff2 files (regular and bold, or the
 * nearest weights it has) onto the booth, so it renders without Wi-Fi.
 */
export async function installLibraryFont(
  deps: FontLibraryDeps,
  fontsourceId: string,
): Promise<FontAsset> {
  const fetchFn = deps.fetch ?? fetch;
  const detail = fontsourceDetailSchema.parse(
    await fetchJson(
      fetchFn,
      `${FONTSOURCE_API}/${encodeURIComponent(fontsourceId)}`,
    ),
  );
  const nearest = (target: number) =>
    detail.weights.reduce((best, weight) =>
      Math.abs(weight - target) < Math.abs(best - target) ? weight : best,
    );
  const weights = [...new Set(LIBRARY_FONT_WEIGHTS.map(nearest))];
  const files = await Promise.all(
    weights.map(async (weight) => {
      const url = detail.variants[String(weight)]?.normal?.latin?.url.woff2;
      if (!url) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `${detail.family} has no latin ${weight} weight.`,
        });
      }
      return { weight, bytes: await download(fetchFn, url) };
    }),
  );
  return await storeFont(deps, {
    family: detail.family,
    source: "fontsource",
    license: detail.license,
    files,
  });
}

/** A woff2 staff upload, after they confirmed they may use it. */
export async function uploadFont(
  deps: FontLibraryDeps,
  font: { family: string; weight: number; bytes: Uint8Array },
): Promise<FontAsset> {
  assertWoff2(font.bytes);
  return await storeFont(deps, {
    family: font.family,
    source: "upload",
    license: "Confirmed by staff on upload",
    files: [{ weight: font.weight, bytes: font.bytes }],
  });
}

export function listFontAssets({ db }: Pick<FontLibraryDeps, "db">) {
  return db.select().from(fontAssetTable).all().map(toAsset);
}

/** The roles of the active event that use this font. */
function rolesUsing(db: DB, assetId: string): FontRole[] {
  const campaign = db
    .select({ kitSettings: campaignTable.kitSettings })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (!campaign) return [];
  const { fonts = {} } = readKitSettings(campaign.kitSettings).settings;
  return FONT_ROLES.filter((role) => {
    const ref = fonts[role];
    return ref !== undefined && parseFontAssetRef(ref) === assetId;
  });
}

export async function deleteFontAsset(
  { db, fontsDir }: FontLibraryDeps,
  assetId: string,
): Promise<void> {
  const roles = rolesUsing(db, assetId);
  if (roles.length > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `The event uses this font for: ${roles.join(", ")}. Pick another font there first.`,
    });
  }
  db.delete(fontAssetTable).where(eq(fontAssetTable.id, assetId)).run();
  await rm(join(fontsDir, assetId), { recursive: true, force: true });
}

/** An added font's files, for Shutter to register with `FontFace`. */
export async function readFontAsset(
  { db, fontsDir }: FontLibraryDeps,
  assetId: string,
) {
  const row = db
    .select()
    .from(fontAssetTable)
    .where(eq(fontAssetTable.id, assetId))
    .get();
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Font not found." });
  }
  return {
    id: row.id,
    family: row.family,
    files: await Promise.all(
      row.files.map(async (file) => ({
        weight: file.weight,
        style: file.style,
        base64: (await readFile(join(fontsDir, file.path))).toString("base64"),
      })),
    ),
  };
}

/**
 * Drops font roles that point at a font no longer on the booth, so they
 * fall back to the kit's font instead of the system's.
 */
export function withInstalledFonts(db: DB, settings: KitSettings): KitSettings {
  const fonts = settings.fonts;
  if (!fonts) return settings;
  const assetIds = Object.values(fonts)
    .map((ref) => parseFontAssetRef(ref as KitFontRef))
    .filter((id): id is string => id !== null);
  if (assetIds.length === 0) return settings;
  const installed = new Set(
    db
      .select({ id: fontAssetTable.id })
      .from(fontAssetTable)
      .where(inArray(fontAssetTable.id, assetIds))
      .all()
      .map((row) => row.id),
  );
  const kept = Object.fromEntries(
    Object.entries(fonts).filter(([, ref]) => {
      const id = parseFontAssetRef(ref as KitFontRef);
      return id === null || installed.has(id);
    }),
  );
  return { ...settings, fonts: kept };
}

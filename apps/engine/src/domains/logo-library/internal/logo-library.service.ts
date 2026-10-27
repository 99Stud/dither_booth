import { MAX_LOGO_FILE_BYTES } from "@dither-booth/shared/kit-partners";
import { readKitSettings, type KitSettings } from "@dither-booth/shared/kits";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import type { DB } from "#db/internal/db.types";

import { campaignTable, logoAssetTable } from "#db/internal/db.schema";
import { GRAPHICS_BLACK_CUTOFF } from "#domains/printer/printer.service";

import {
  LOGO_MAX_HEIGHT_PX,
  LOGO_MAX_WIDTH_PX,
  PNG_SIGNATURE,
} from "./logo-library.constants";

export type LogoLibraryDeps = {
  db: DB;
  logosDir: string;
};

export type LogoAsset = {
  id: string;
  name: string;
  width: number;
  height: number;
};

const toAsset = (row: typeof logoAssetTable.$inferSelect): LogoAsset => ({
  id: row.id,
  name: row.name,
  width: row.width,
  height: row.height,
});

const logoPath = (logosDir: string, id: string) => join(logosDir, `${id}.png`);

/** An XML declaration, comments or a doctype may come before `<svg`. */
const SVG_START =
  /^﻿?\s*(?:<\?xml[^>]*\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>]/iu;

function sniffLogo(bytes: Uint8Array): "png" | "svg" | null {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return "png";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  return SVG_START.test(head) ? "svg" : null;
}

/** Draws an SVG big enough that trimming its margins still leaves detail. */
async function svgDensity(bytes: Uint8Array): Promise<number> {
  const { height = 0 } = await sharp(bytes).metadata();
  const target = 4 * LOGO_MAX_HEIGHT_PX;
  return Math.min(
    2400,
    Math.max(72, Math.ceil((72 * target) / Math.max(1, height))),
  );
}

/**
 * A logo as it will print: black and white at the printer's cutoff, its
 * margins trimmed, at most 144 px tall. An SVG is drawn here and never kept,
 * so the booth only ever serves PNGs it made itself.
 */
export async function prepareLogo(
  bytes: Uint8Array,
): Promise<{ png: Buffer; width: number; height: number }> {
  if (bytes.length > MAX_LOGO_FILE_BYTES) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "A logo can be up to 2 MB.",
    });
  }
  const kind = sniffLogo(bytes);
  if (!kind) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Upload a PNG or an SVG.",
    });
  }

  try {
    const density = kind === "svg" ? await svgDensity(bytes) : undefined;
    // sharp runs its steps in a fixed order, so trimming and resizing what
    // prints takes a second pass over the black and white image.
    const printed = await sharp(bytes, { density })
      .flatten({ background: "#ffffff" })
      .threshold(GRAPHICS_BLACK_CUTOFF)
      .png()
      .toBuffer();
    const { channels } = await sharp(printed).stats();
    if ((channels[0]?.min ?? 255) === 255) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "This logo has nothing to print: it is all white or too light.",
      });
    }
    const { data, info } = await sharp(printed)
      .trim({ background: "#ffffff", threshold: 0 })
      .resize({
        width: LOGO_MAX_WIDTH_PX,
        height: LOGO_MAX_HEIGHT_PX,
        fit: "inside",
      })
      .threshold(GRAPHICS_BLACK_CUTOFF)
      .png({ palette: true, colours: 2, dither: 0 })
      .toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This file couldn't be read as a PNG or an SVG.",
      cause: error,
    });
  }
}

/** A PNG or SVG staff upload, kept as it will print. */
export async function uploadLogo(
  { db, logosDir }: LogoLibraryDeps,
  logo: { name: string; bytes: Uint8Array },
): Promise<LogoAsset> {
  const { png, width, height } = await prepareLogo(logo.bytes);
  // The path is made from a generated id, never from a name a user typed.
  const id = createId();
  await mkdir(logosDir, { recursive: true });
  try {
    await writeFile(logoPath(logosDir, id), png);
    const row = db
      .insert(logoAssetTable)
      .values({ id, name: logo.name, width, height })
      .returning()
      .get();
    return toAsset(row);
  } catch (error) {
    await rm(logoPath(logosDir, id), { force: true });
    throw error;
  }
}

export function listLogoAssets({ db }: Pick<LogoLibraryDeps, "db">) {
  return db.select().from(logoAssetTable).all().map(toAsset);
}

/** Whether the active event prints this logo in its partner row. */
function activeEventPrints(db: DB, assetId: string): boolean {
  const campaign = db
    .select({ kitSettings: campaignTable.kitSettings })
    .from(campaignTable)
    .where(eq(campaignTable.status, "active"))
    .get();
  if (!campaign) return false;
  const { partners = [] } = readKitSettings(campaign.kitSettings).settings;
  return partners.includes(assetId);
}

export async function deleteLogoAsset(
  { db, logosDir }: LogoLibraryDeps,
  assetId: string,
): Promise<void> {
  if (activeEventPrints(db, assetId)) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The event prints this logo in its partner row. Take it out of the row first.",
    });
  }
  db.delete(logoAssetTable).where(eq(logoAssetTable.id, assetId)).run();
  await rm(logoPath(logosDir, assetId), { force: true });
}

/** An added logo's PNG, for the partner row and admin to show. */
export async function readLogoAsset(
  { db, logosDir }: LogoLibraryDeps,
  assetId: string,
) {
  const row = db
    .select()
    .from(logoAssetTable)
    .where(eq(logoAssetTable.id, assetId))
    .get();
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Logo not found." });
  }
  return {
    ...toAsset(row),
    base64: (await readFile(logoPath(logosDir, row.id))).toString("base64"),
  };
}

/**
 * Drops partners that point at a logo no longer on the booth, so the row
 * prints the logos that are left instead of failing the ticket.
 */
export function withInstalledLogos(db: DB, settings: KitSettings): KitSettings {
  const partners = settings.partners;
  if (!partners || partners.length === 0) return settings;
  const installed = new Set(
    db
      .select({ id: logoAssetTable.id })
      .from(logoAssetTable)
      .where(inArray(logoAssetTable.id, partners))
      .all()
      .map((row) => row.id),
  );
  return { ...settings, partners: partners.filter((id) => installed.has(id)) };
}

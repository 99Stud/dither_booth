import {
  FONT_ROLE_CSS_VARIABLES,
  FONT_ROLES,
  fontAssetFamily,
  fontStack,
  parseFontAssetRef,
  type ResolvedKitFonts,
} from "@dither-booth/shared/kit-fonts";

import { trpcClient } from "#lib/trpc/trpc.client";

/**
 * Points the font CSS variables at the kit's fonts, or back at the
 * stylesheet's defaults with `null`. Inline on `<html>`, so it outranks the
 * stylesheet; the Darkroom clears it to keep its own theme's fonts.
 */
export function applyKitFonts(fonts: ResolvedKitFonts | null): void {
  const { style } = document.documentElement;
  for (const role of FONT_ROLES) {
    for (const variable of FONT_ROLE_CSS_VARIABLES[role]) {
      if (fonts) style.setProperty(variable, fontStack(fonts, role));
      else style.removeProperty(variable);
    }
  }
}

/**
 * Resolves once the fonts the page now uses have loaded, so a screenshot
 * never catches a fallback font. The frame lets layout request them first.
 */
export async function waitForKitFonts(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await document.fonts.ready;
}

const registered = new Map<string, Promise<void>>();

const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

async function registerFontAsset(assetId: string): Promise<void> {
  const asset = await trpcClient.booth.getFontAsset.query({ id: assetId });
  await Promise.all(
    asset.files.map(async (file) => {
      const face = new FontFace(
        fontAssetFamily(assetId),
        base64ToBytes(file.base64),
        { weight: String(file.weight), style: file.style },
      );
      document.fonts.add(face);
      await face.load();
    }),
  );
}

/**
 * Registers the fonts added to the booth (`asset:` roles) that the kit uses,
 * once each. Bundled fonts need nothing: their `@font-face` rules ship
 * with the page.
 */
export async function loadKitAssetFonts(
  fonts: ResolvedKitFonts,
): Promise<void> {
  const assetIds = new Set(
    FONT_ROLES.map((role) => parseFontAssetRef(fonts[role])).filter(
      (id): id is string => id !== null,
    ),
  );
  await Promise.all(
    [...assetIds].map((assetId) => {
      let loading = registered.get(assetId);
      if (!loading) {
        loading = registerFontAsset(assetId).catch((error: unknown) => {
          // Retried on the next kit; meanwhile the stack falls back.
          registered.delete(assetId);
          throw error;
        });
        registered.set(assetId, loading);
      }
      return loading;
    }),
  );
}

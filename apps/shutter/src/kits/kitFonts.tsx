import {
  FONT_ROLE_CSS_VARIABLES,
  FONT_ROLES,
  fontStack,
  type KitFonts,
} from "@dither-booth/shared/kit-fonts";

/**
 * Points the font CSS variables at the kit's fonts, or back at the
 * stylesheet's defaults with `null`. Inline on `<html>`, so it outranks the
 * stylesheet; the Darkroom clears it to keep its own theme's fonts.
 */
export function applyKitFonts(fonts: KitFonts | null): void {
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

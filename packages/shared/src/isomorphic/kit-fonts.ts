import z from "zod";

/**
 * Typefaces on the booth screen and the tickets, by role. A kit picks a
 * font for each role; an event can swap any of them for another bundled
 * font. Every bundled font ships with Shutter, so nothing loads from the
 * network on event day.
 */

export const FONT_ROLES = ["display", "body", "mono"] as const;

export type FontRole = (typeof FONT_ROLES)[number];

export const FONT_ROLE_LABELS: Record<
  FontRole,
  { label: string; help: string }
> = {
  display: {
    label: "Display",
    help: "Titles, the start button, prompts and most of the tickets.",
  },
  body: {
    label: "Body",
    help: "Smaller running text, and the fallback for the display font.",
  },
  mono: {
    label: "Numbers",
    help: "Prices, counters and other figures that line up.",
  },
};

/** The CSS variables each role sets; components use them through Tailwind. */
export const FONT_ROLE_CSS_VARIABLES: Record<FontRole, string[]> = {
  display: ["--font-bit"],
  body: ["--font-sans"],
  mono: ["--font-mono", "--font-heading"],
};

const FALLBACKS: Record<FontRole, string> = {
  display:
    'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  body: "ui-sans-serif, system-ui, sans-serif",
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
};

export type BundledFont = {
  label: string;
  /** The `font-family` its `@font-face` rules declare in Shutter. */
  family: string;
};

/** Fonts compiled into Shutter (`styles/globals.css`). */
export const BUNDLED_FONTS = {
  "pp-neue-bit": { label: "PP Neue Bit", family: "PPNeueBit" },
  "ibm-plex-sans": { label: "IBM Plex Sans", family: "IBM Plex Sans" },
  "geist-mono": { label: "Geist Mono", family: "Geist Mono Variable" },
  creepster: { label: "Creepster", family: "Creepster" },
  "special-elite": { label: "Special Elite", family: "Special Elite" },
} as const satisfies Record<string, BundledFont>;

export type BundledFontId = keyof typeof BUNDLED_FONTS;

export const BUNDLED_FONT_IDS = Object.keys(BUNDLED_FONTS) as BundledFontId[];

export const bundledFontIdSchema = z.enum(
  BUNDLED_FONT_IDS as [BundledFontId, ...BundledFontId[]],
);

/** A kit's own fonts are always bundled ones. */
export type KitFonts = Record<FontRole, BundledFontId>;

/**
 * A font added to this booth from admin (`font_asset`), named by its id.
 * It lives on the booth's SSD, so it works offline too.
 */
export type FontAssetRef = `asset:${string}`;

/** A role's font: bundled with Shutter, or added to this booth. */
export type KitFontRef = BundledFontId | FontAssetRef;

export type ResolvedKitFonts = Record<FontRole, KitFontRef>;

const FONT_ASSET_PREFIX = "asset:";

export const fontAssetRefSchema = z
  .string()
  .regex(/^asset:[a-z0-9]{8,40}$/u)
  .transform((ref) => ref as FontAssetRef);

export const kitFontRefSchema = z.union([
  bundledFontIdSchema,
  fontAssetRefSchema,
]);

export const toFontAssetRef = (assetId: string): FontAssetRef =>
  `${FONT_ASSET_PREFIX}${assetId}`;

/** The asset id a role points at, or null for a bundled font. */
export const parseFontAssetRef = (ref: KitFontRef): string | null =>
  ref.startsWith(FONT_ASSET_PREFIX)
    ? ref.slice(FONT_ASSET_PREFIX.length)
    : null;

/** The `font-family` Shutter registers an added font under. */
export const fontAssetFamily = (assetId: string) => `Kit Font ${assetId}`;

const familyOf = (ref: KitFontRef): string => {
  const assetId = parseFontAssetRef(ref);
  return assetId
    ? fontAssetFamily(assetId)
    : BUNDLED_FONTS[ref as BundledFontId].family;
};

/** An event's font swaps: only the roles it changes. */
export const kitFontOverridesSchema = z
  .object({
    display: kitFontRefSchema.optional(),
    body: kitFontRefSchema.optional(),
    mono: kitFontRefSchema.optional(),
  })
  .strict();

export type KitFontOverrides = Partial<Record<FontRole, KitFontRef>>;

/** Stored font swaps, keeping each role this release can render. */
export function readKitFontOverrides(stored: unknown): {
  overrides: KitFontOverrides;
  rejectedKeys: string[];
} {
  const overrides: KitFontOverrides = {};
  const rejectedKeys: string[] = [];
  if (typeof stored !== "object" || stored === null) {
    return { overrides, rejectedKeys };
  }
  for (const [key, value] of Object.entries(stored)) {
    const role = FONT_ROLES.find((entry) => entry === key);
    const font = kitFontRefSchema.safeParse(value);
    if (role && font.success) overrides[role] = font.data;
    else rejectedKeys.push(key);
  }
  return { overrides, rejectedKeys };
}

/**
 * The `font-family` value for a role: its font, then the body font for the
 * display role (as the kiosk always did), then system fonts.
 */
export function fontStack(fonts: ResolvedKitFonts, role: FontRole): string {
  const families = [familyOf(fonts[role])];
  if (role === "display") families.push(familyOf(fonts.body));
  return [...families.map((family) => `"${family}"`), FALLBACKS[role]].join(
    ", ",
  );
}

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

export type KitFonts = Record<FontRole, BundledFontId>;

/** An event's font swaps: only the roles it changes. */
export const kitFontOverridesSchema = z
  .object({
    display: bundledFontIdSchema.optional(),
    body: bundledFontIdSchema.optional(),
    mono: bundledFontIdSchema.optional(),
  })
  .strict();

export type KitFontOverrides = z.infer<typeof kitFontOverridesSchema>;

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
    const font = bundledFontIdSchema.safeParse(value);
    if (role && font.success) overrides[role] = font.data;
    else rejectedKeys.push(key);
  }
  return { overrides, rejectedKeys };
}

/**
 * The `font-family` value for a role: its font, then the body font for the
 * display role (as the kiosk always did), then system fonts.
 */
export function fontStack(fonts: KitFonts, role: FontRole): string {
  const families = [BUNDLED_FONTS[fonts[role]].family];
  if (role === "display") families.push(BUNDLED_FONTS[fonts.body].family);
  return [...families.map((family) => `"${family}"`), FALLBACKS[role]].join(
    ", ",
  );
}

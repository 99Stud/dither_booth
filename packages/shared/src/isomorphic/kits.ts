import z from "zod";

import type { KitCopy } from "#isomorphic/kit-copy";

import {
  applyBackgroundControls,
  backgroundSettingsSchema,
  readBackgroundSettings,
  type BackgroundSettings,
} from "#isomorphic/background-controls";
import {
  BACKGROUND_PRESETS,
  type BackgroundId,
  type BackgroundPreset,
} from "#isomorphic/backgrounds";
import {
  kitCopyOverridesSchema,
  readKitCopyOverrides,
} from "#isomorphic/kit-copy";
import {
  kitFontOverridesSchema,
  readKitFontOverrides,
  type KitFontOverrides,
  type KitFonts,
  type ResolvedKitFonts,
} from "#isomorphic/kit-fonts";
import { kitPartnersSchema, type KitPartners } from "#isomorphic/kit-partners";

/**
 * Kits compiled into this release. An event stores its kit as free text
 * (`campaign.kit_id`), checked against this list in code, so adding a kit
 * never needs a database migration.
 */
export const KIT_IDS = ["tartines", "halloween-2026"] as const;

export const kitIdSchema = z.enum(KIT_IDS);

export type KitId = z.infer<typeof kitIdSchema>;

/** Used when an event names no kit, or one this release doesn't ship. */
export const DEFAULT_KIT_ID = "tartines" satisfies KitId;

/**
 * What every app may know about a kit without loading its code. The kit's
 * tickets and screens live in Shutter (`apps/shutter/src/kits/<id>`).
 */
export type KitManifest = {
  /** Shown wherever staff pick a kit. */
  label: string;
  /** The kit's own text, which an event's edits override key by key. */
  copy: KitCopy;
  /** The kit's font for each role, which an event can swap. */
  fonts: KitFonts;
  /** The kit's shader and its own look; an event moves its controls. */
  background: BackgroundPreset;
  /** The CRT over the camera square. */
  camera: CameraScreen;
};

const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu);

/**
 * The CRT over the camera square: lines and sweep, and a colour wash.
 * `strength` 50 is the kit's opacities.
 */
export const cameraScreenSchema = z.object({
  crtLines: z.boolean(),
  wash: z.boolean(),
  /** "background" follows the shader's highlight colour. */
  tint: z.union([z.literal("background"), hexColorSchema]),
  strength: z.number().min(0).max(100),
});

export type CameraScreen = z.infer<typeof cameraScreenSchema>;

export const cameraScreenOverridesSchema = cameraScreenSchema
  .partial()
  .strict();

const TARTINES_FONTS: KitFonts = {
  display: "pp-neue-bit",
  body: "ibm-plex-sans",
  mono: "geist-mono",
};

const TARTINES_COPY: KitCopy = {
  "landing.poweredBy": "powered by **99stud**™",
  "landing.start": "Press to start",
  "landing.lotteryTitle": "lottery",
  "landing.remainingPrizes": "**{count}** remaining prizes",
  "landing.totalAttempts": "total: {count} attempts",
  "landing.legalNotice": "legal_notice",
  "prompts.stayInFrame": "stay in the frame",
  "prompts.strikePose": "strike a pose :)",
  "prompts.feelingLucky": "feeling lucky?",
  "prompts.thatsIt": "that's it",
  "prompts.printing": "printing...",
  "maintenance.title": "be right back",
  "maintenance.body":
    "the booth is taking a short break. come back in a few minutes.",
  "photoTicket.venueName": "Épicerie de Ginette",
  "photoTicket.venueAddress": "24 Cr Albert Thomas, 69008 Lyon",
  "photoTicket.itemsTitle": "ITEMS",
  "photoTicket.totalLabel": "TOTAL",
  "photoTicket.socialPrompt": "Join us on Instagram!",
  "photoTicket.socialHandle": "@99stud",
  "photoTicket.thanks": "Thanks for partying with us!",
  "lotteryTicket.win": "WINNER!",
  "lotteryTicket.loss": "LOSER!",
  "lotteryTicket.lossJoke": "Spam won't help, sorry mate!",
};

export const KIT_MANIFESTS = {
  tartines: {
    label: "Tartines",
    fonts: TARTINES_FONTS,
    background: BACKGROUND_PRESETS.fluid,
    camera: { crtLines: true, wash: true, tint: "background", strength: 50 },
    copy: TARTINES_COPY,
  },
  /** Tartines' tickets, fonts and text, on #18's charcoal smoke (Merlin's values). */
  "halloween-2026": {
    label: "Halloween 2026",
    fonts: TARTINES_FONTS,
    background: BACKGROUND_PRESETS.smoke,
    // Charcoal is grey: no blue CRT over the camera (user, 2026-10-16).
    camera: { crtLines: false, wash: false, tint: "background", strength: 50 },
    copy: TARTINES_COPY,
  },
} as const satisfies Record<KitId, KitManifest>;

/**
 * What an event changes on its kit, stored on the event. Only the changes are
 * kept, so a kit's new defaults reach every event that didn't touch them.
 */
export const kitSettingsSchema = z
  .object({
    copy: kitCopyOverridesSchema.optional(),
    fonts: kitFontOverridesSchema.optional(),
    background: backgroundSettingsSchema.optional(),
    camera: cameraScreenOverridesSchema.optional(),
    partners: kitPartnersSchema.optional(),
  })
  .strict();

export type KitSettings = {
  copy?: z.infer<typeof kitCopyOverridesSchema>;
  fonts?: KitFontOverrides;
  background?: BackgroundSettings;
  camera?: Partial<CameraScreen>;
  partners?: KitPartners;
};

/** The camera CRT as it renders, its tint resolved to a colour. */
export type ResolvedCameraScreen = Omit<CameraScreen, "tint"> & {
  tint: string;
};

/** What the kiosk and the tickets render: the kit with the event's edits. */
export type ResolvedKit = {
  kitId: KitId;
  copy: KitCopy;
  fonts: ResolvedKitFonts;
  background: BackgroundPreset;
  camera: ResolvedCameraScreen;
  partners: KitPartners;
};

/**
 * The shader an event's kit renders before its controls move: the kit's own
 * preset for the kit's shader, or that shader's built-in look for another.
 */
export function getBackgroundBase(
  kitId: KitId,
  backgroundId: BackgroundId,
): BackgroundPreset {
  const kitBackground = KIT_MANIFESTS[kitId].background;
  return kitBackground.effect === backgroundId
    ? kitBackground
    : BACKGROUND_PRESETS[backgroundId];
}

/** The colour "match background" takes: the shader's brightest tone. */
export function getBackgroundHighlight(preset: BackgroundPreset): string {
  return preset.effect === "fluid"
    ? preset.settings.turbulence.palette[3]
    : preset.settings.smoke.paperColor;
}

/**
 * The kit to render for a stored id. `known` is false when the id names a
 * kit this release doesn't ship, such as one set by a newer release, and the
 * default kit is used instead.
 */
export const resolveKitId = (
  stored: string | null,
): { kitId: KitId; known: boolean } => {
  if (stored === null) {
    return { kitId: DEFAULT_KIT_ID, known: true };
  }

  const parsed = kitIdSchema.safeParse(stored);

  return parsed.success
    ? { kitId: parsed.data, known: true }
    : { kitId: DEFAULT_KIT_ID, known: false };
};

/**
 * An event's stored kit settings, keeping every part this release can use.
 * `rejectedKeys` names what was dropped, so the caller can log it.
 */
export function readKitSettings(stored: unknown): {
  settings: KitSettings;
  rejectedKeys: string[];
} {
  if (typeof stored !== "object" || stored === null) {
    return { settings: {}, rejectedKeys: [] };
  }

  const { copy, fonts, background, camera, partners, ...rest } =
    stored as Record<string, unknown>;
  const settings: KitSettings = {};
  const rejectedKeys = Object.keys(rest);

  const readCopy = readKitCopyOverrides(copy);
  if (Object.keys(readCopy.overrides).length > 0) {
    settings.copy = readCopy.overrides;
  }
  rejectedKeys.push(...readCopy.rejectedKeys.map((key) => `copy.${key}`));

  const readFonts = readKitFontOverrides(fonts);
  if (Object.keys(readFonts.overrides).length > 0) {
    settings.fonts = readFonts.overrides;
  }
  rejectedKeys.push(...readFonts.rejectedKeys.map((key) => `fonts.${key}`));

  const readBackground = readBackgroundSettings(background);
  if (readBackground.settings) settings.background = readBackground.settings;
  rejectedKeys.push(...readBackground.rejectedKeys);

  if (camera !== undefined) {
    const readCamera = cameraScreenOverridesSchema.safeParse(camera);
    if (readCamera.success) settings.camera = readCamera.data;
    else rejectedKeys.push("camera");
  }

  if (partners !== undefined) {
    const readPartners = kitPartnersSchema.safeParse(partners);
    if (readPartners.success) settings.partners = readPartners.data;
    else rejectedKeys.push("partners");
  }

  return { settings, rejectedKeys };
}

/** The kit with an event's settings applied. */
export function resolveKit(kitId: KitId, settings: KitSettings): ResolvedKit {
  const manifest = KIT_MANIFESTS[kitId];
  const backgroundId = settings.background?.id ?? manifest.background.effect;
  const background = applyBackgroundControls(
    getBackgroundBase(kitId, backgroundId),
    settings.background?.values ?? {},
  );
  const camera = { ...manifest.camera, ...settings.camera };

  return {
    kitId,
    copy: { ...manifest.copy, ...settings.copy },
    fonts: { ...manifest.fonts, ...settings.fonts },
    background,
    camera: {
      ...camera,
      tint:
        camera.tint === "background"
          ? getBackgroundHighlight(background)
          : camera.tint,
    },
    partners: settings.partners ?? [],
  };
}

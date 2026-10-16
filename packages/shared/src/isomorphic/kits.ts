import z from "zod";

import type { KitCopy } from "#isomorphic/kit-copy";

import {
  kitCopyOverridesSchema,
  readKitCopyOverrides,
} from "#isomorphic/kit-copy";

/**
 * Kits compiled into this release. An event stores its kit as free text
 * (`campaign.kit_id`), checked against this list in code, so adding a kit
 * never needs a database migration.
 */
export const KIT_IDS = ["tartines"] as const;

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
};

export const KIT_MANIFESTS = {
  tartines: {
    label: "Tartines",
    copy: {
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
    },
  },
} as const satisfies Record<KitId, KitManifest>;

/**
 * What an event changes on its kit, stored on the event. Only the changes are
 * kept, so a kit's new defaults reach every event that didn't touch them.
 */
export const kitSettingsSchema = z
  .object({ copy: kitCopyOverridesSchema.optional() })
  .strict();

export type KitSettings = z.infer<typeof kitSettingsSchema>;

/** What the kiosk and the tickets render: the kit with the event's edits. */
export type ResolvedKit = {
  kitId: KitId;
  copy: KitCopy;
};

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

  const { copy, ...rest } = stored as Record<string, unknown>;
  const read = readKitCopyOverrides(copy);

  return {
    settings:
      Object.keys(read.overrides).length > 0 ? { copy: read.overrides } : {},
    rejectedKeys: [
      ...Object.keys(rest),
      ...read.rejectedKeys.map((key) => `copy.${key}`),
    ],
  };
}

/** The kit with an event's settings applied. */
export function resolveKit(kitId: KitId, settings: KitSettings): ResolvedKit {
  return {
    kitId,
    copy: { ...KIT_MANIFESTS[kitId].copy, ...settings.copy },
  };
}

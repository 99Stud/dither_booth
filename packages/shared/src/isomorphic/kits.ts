import z from "zod";

/**
 * Kits compiled into this release. An event stores its kit as free text
 * (`campaign.kit_id`), checked against this list in code, so adding a kit
 * never needs a database migration.
 */
export const KIT_IDS = ["tartines", "heirvey"] as const;

export const kitIdSchema = z.enum(KIT_IDS);

export type KitId = z.infer<typeof kitIdSchema>;

/** Used when an event names no kit, or one this release doesn't ship. */
export const DEFAULT_KIT_ID = "tartines" satisfies KitId;

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

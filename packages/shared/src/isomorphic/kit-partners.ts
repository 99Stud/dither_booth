import z from "zod";

/** The partner row fits this many logos across the ticket. */
export const MAX_PARTNERS = 4;

/** An uploaded logo is a PNG or an SVG of at most this many bytes. */
export const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024;

/** The file types staff can upload as a logo. */
export const LOGO_UPLOAD_ACCEPT = ".png,.svg,image/png,image/svg+xml";

/** A logo added to this booth from admin (`logo_asset`), by its id. */
export const logoAssetIdSchema = z.string().regex(/^[a-z0-9]{8,40}$/u);

/**
 * The logos an event prints in its partner row, in order. They belong to
 * the event, so they carry across a change of kit.
 */
export const kitPartnersSchema = z
  .array(logoAssetIdSchema)
  .max(MAX_PARTNERS)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "A logo can only be in the partner row once.",
  });

export type KitPartners = z.infer<typeof kitPartnersSchema>;

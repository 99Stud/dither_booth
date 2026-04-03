import { z } from "zod";

export const imageMimeType = z.enum([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/bmp",
]);

export const ditherModeSchema = z.enum([
  "none",
  "burkes",
  "ordered",
  "floyd-steinberg",
  "atkinson",
  "stucki",
  "sierra",
  "sierra-lite",
  "jarvis-judice-ninke",
]);

export type DitherModeKey = z.infer<typeof ditherModeSchema>;

export const printImageSchema = z
  .object({
    image: z.string().min(1),
    mimeType: imageMimeType.optional(),
    ditherMode: ditherModeSchema.optional().default("ordered"),
    brightness: z.number().min(0).max(3).optional().default(1),
    contrast: z.number().min(0).max(3).optional().default(1),
    gamma: z.number().min(0.1).max(5).optional().default(1),
    threshold: z.number().int().min(0).max(255).optional().default(128),
  })
  .superRefine((data, ctx) => {
    if (!data.image.startsWith("data:image/") && data.mimeType === undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          "mimeType is required when image is raw base64 (not a data URL)",
        path: ["mimeType"],
      });
    }
  });

export type PrintImageInput = z.infer<typeof printImageSchema>;

import z from "zod";

import type { LotteryStatus } from "#isomorphic/lottery";

import { kitIdSchema, kitSettingsSchema } from "#isomorphic/kits";
import { RECEIPT_VIEWER_PATH } from "#isomorphic/routes";

/**
 * Admin's live preview of a kit draft: it frames Shutter's own screens and
 * tickets and streams the draft to them with `postMessage`. A preview page
 * only draws: it never calls the engine's mutations, the camera or the
 * kiosk channel, and it shows sample data.
 */

export const KIT_PREVIEW_PATH = "/preview";

/** The framing admin's origin; a preview page only listens to it. */
export const KIT_PREVIEW_PARENT_PARAM = "kitPreview";

export const KIT_PREVIEW_SURFACES = [
  "landing",
  "camera",
  "photo",
  "lotteryWin",
  "lotteryLoss",
] as const;

export type KitPreviewSurface = (typeof KIT_PREVIEW_SURFACES)[number];

export const KIT_PREVIEW_SURFACE_LABELS: Record<KitPreviewSurface, string> = {
  landing: "Home screen",
  camera: "Camera",
  photo: "Photo receipt",
  lotteryWin: "Lottery win",
  lotteryLoss: "Lottery loss",
};

/** Admin to preview: show this draft. */
export const kitPreviewMessageSchema = z.object({
  type: z.literal("kit.preview"),
  kitId: kitIdSchema,
  settings: kitSettingsSchema,
});

export type KitPreviewMessage = z.infer<typeof kitPreviewMessageSchema>;

/** Preview to admin: listening, send the draft. */
export const KIT_PREVIEW_READY_MESSAGE = { type: "kit.preview.ready" } as const;

export const SAMPLE_LOTTERY_STATUS: LotteryStatus = {
  enabled: true,
  remainingPrizes: 42,
  rarityBreakdown: [
    { rarity: "legendary", remaining: 2 },
    { rarity: "rare", remaining: 10 },
    { rarity: "common", remaining: 30 },
  ],
  lastWinAt: null,
  totalDraws: 128,
};

/** The Shutter URL that previews `surface` for the admin at `adminOrigin`. */
export function getKitPreviewUrl(
  shutterOrigin: string,
  adminOrigin: string,
  surface: KitPreviewSurface,
): string {
  const ticketSearch: Partial<
    Record<KitPreviewSurface, Record<string, string>>
  > = {
    photo: { template: "photo", ticketRef: "000123" },
    lotteryWin: {
      template: "lottery",
      outcome: "win",
      title: "A 99stud sticker",
      winInstruction: "Show this ticket at the bar",
      prizeRarity: "rare",
      wonAt: "2026-10-31T21:00:00.000Z",
      ticketRef: "000123",
    },
    lotteryLoss: { template: "lottery", outcome: "loss", ticketRef: "000123" },
  };
  const search = ticketSearch[surface];
  const url = new URL(
    search ? RECEIPT_VIEWER_PATH : KIT_PREVIEW_PATH,
    shutterOrigin,
  );
  for (const [key, value] of Object.entries(search ?? { surface })) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set(KIT_PREVIEW_PARENT_PARAM, adminOrigin);
  return url.toString();
}

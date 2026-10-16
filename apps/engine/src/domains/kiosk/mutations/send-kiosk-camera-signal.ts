import {
  cameraPreviewSessionIdSchema,
  cameraSignalSchema,
} from "@dither-booth/shared/camera-preview";
import { kioskPageSchema } from "@dither-booth/shared/kiosk";
import z from "zod";

import { boothProcedure } from "#internal/trpc";

/**
 * The kiosk page's offer, candidates or end, relayed to the viewer. Only
 * the page the session is on is heard, since any origin may call this.
 */
export const sendKioskCameraSignal = boothProcedure
  .input(
    z.object({
      pageId: kioskPageSchema.shape.pageId,
      sessionId: cameraPreviewSessionIdSchema,
      signal: cameraSignalSchema,
    }),
  )
  .mutation(({ ctx, input }) => ({
    delivered: ctx.cameraPreview.fromPage(
      input.pageId,
      input.sessionId,
      input.signal,
    ),
  }));

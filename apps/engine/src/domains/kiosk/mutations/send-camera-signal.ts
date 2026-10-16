import {
  cameraPreviewSessionIdSchema,
  cameraSignalSchema,
} from "@dither-booth/shared/camera-preview";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

/** The viewer's answer, candidates or end, relayed to the kiosk page. */
export const sendCameraSignal = opsProcedure
  .input(
    z.object({
      sessionId: cameraPreviewSessionIdSchema,
      signal: cameraSignalSchema,
    }),
  )
  .mutation(({ ctx, input }) => ({
    delivered: ctx.cameraPreview.fromViewer(input.sessionId, input.signal),
  }));

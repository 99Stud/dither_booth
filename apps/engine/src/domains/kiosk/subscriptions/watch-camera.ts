import { cameraPreviewSessionIdSchema } from "@dither-booth/shared/camera-preview";
import z from "zod";

import { opsProcedure } from "#internal/trpc";

/**
 * A live view of the booth camera, over SSE. The stream is the session:
 * it opens with `start`, carries the kiosk page's offer and candidates, and
 * ending it (Stop, page closed) tells the page to stop sending.
 */
export const watchCamera = opsProcedure
  .input(z.object({ sessionId: cameraPreviewSessionIdSchema }))
  .subscription(async function* ({ ctx, input, signal }) {
    yield* ctx.cameraPreview.watch(input.sessionId, signal);
  });

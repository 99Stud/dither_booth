import {
  kioskPageSchema,
  kioskPageStatusSchema,
} from "@dither-booth/shared/kiosk";

import { boothProcedure } from "#internal/trpc";

/**
 * A kiosk page reporting about itself (its camera), for admin's health
 * checks. `registered: false` means the page isn't subscribed to the kiosk
 * channel (yet): the page sends it again once its stream is up.
 */
export const reportKioskStatus = boothProcedure
  .input(kioskPageStatusSchema.extend({ pageId: kioskPageSchema.shape.pageId }))
  .mutation(({ ctx, input }) => {
    const { pageId, ...status } = input;
    return { registered: ctx.kioskChannel.reportStatus(pageId, status) };
  });

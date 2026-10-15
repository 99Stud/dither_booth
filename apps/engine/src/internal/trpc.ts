import { isAllowedConfiguredOrigin } from "@dither-booth/ports/origin";
import { TRPCError, initTRPC } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

const t = initTRPC.context<TRPCContext>().create({
  sse: {
    // Subscriptions (the kiosk channel) reach the kiosk through the Shutter
    // server's proxy, which Bun.serve closes after 10 s without traffic.
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

export const router = t.router;

const publicProcedure = t.procedure;

const isAdminRequest = (ctx: TRPCContext) =>
  isAllowedConfiguredOrigin(
    ctx.requestOrigin,
    ctx.adminOrigin,
    ctx.allowedHostnames,
  );

const forbidden = () =>
  new TRPCError({
    code: "FORBIDDEN",
    message: "Request origin not allowed.",
  });

const adminOriginProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isAdminRequest(ctx)) {
    throw forbidden();
  }

  return next();
});

/** What the kiosk calls during a guest visit. Reachable from any origin. */
export const boothProcedure = publicProcedure;

/** Event, prize and print authoring, plus operator test prints. */
export const configProcedure = adminOriginProcedure;

/** Health checks and recovery actions for the booth's own services. */
export const opsProcedure = adminOriginProcedure;

/**
 * Print tuning and the checks around it: the admin, or the Darkroom on the
 * booth iPad holding a live token from `booth.unlockDarkroom`. Only those
 * procedures use it; event authoring, restarts and the PIN stay admin-only.
 */
export const darkroomProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isAdminRequest(ctx) && !ctx.darkroomAccess.verify(ctx.darkroomToken)) {
    throw forbidden();
  }

  return next();
});

import { isAllowedConfiguredOrigin } from "@dither-booth/ports/origin";
import { TRPCError, initTRPC } from "@trpc/server";
import z from "zod";

import type { TRPCContext } from "#lib/trpc/trpc.types";

const t = initTRPC.context<TRPCContext>().create({
  // Input errors carry their fields, so a client can say what to fix instead
  // of showing zod's message.
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof z.ZodError
            ? z.flattenError(error.cause)
            : null,
      },
    };
  },
  sse: {
    // Subscriptions (the kiosk channel) reach the kiosk through the Shutter
    // server's proxy, which Bun.serve closes after 10 s without traffic.
    ping: { enabled: true, intervalMs: 5_000 },
    client: { reconnectAfterInactivityMs: 15_000 },
  },
});

export const router = t.router;

const publicProcedure = t.procedure;

/**
 * Admin's own origin, signed in with the staff PIN. The origin alone isn't
 * enough: anything but a browser can send any `Origin`, and the booth's
 * tickets lead anyone who picks one up to admin.
 */
const isAdminRequest = (ctx: TRPCContext) =>
  isAllowedConfiguredOrigin(
    ctx.requestOrigin,
    ctx.adminOrigin,
    ctx.allowedHostnames,
  ) && ctx.darkroomAccess.verify(ctx.darkroomToken);

const forbidden = () =>
  new TRPCError({
    code: "FORBIDDEN",
    message: "Sign in with the staff PIN.",
  });

const adminOriginProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!isAdminRequest(ctx)) {
    throw forbidden();
  }

  return next();
});

/** What the kiosk calls during a guest visit. Reachable from any origin. */
export const boothProcedure = publicProcedure;

/** Event, prize and print authoring, plus operator test prints. Admin only. */
export const configProcedure = adminOriginProcedure;

/** Health checks and recovery actions for the booth's own services. Admin only. */
export const opsProcedure = adminOriginProcedure;

/**
 * Print tuning and the checks around it: the admin, or the Darkroom on the
 * booth iPad, both holding a live token from `booth.unlockDarkroom`. Only
 * those procedures use it; event authoring, restarts and the PIN stay
 * admin-only.
 */
export const darkroomProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.darkroomAccess.verify(ctx.darkroomToken)) {
    throw forbidden();
  }

  return next();
});

/**
 * The booth Wi-Fi's captive page. Only the setup server holds the token, and
 * it serves the page to devices on the booth Wi-Fi only.
 */
export const captiveProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.setupServerAccess.verify(ctx.setupServerToken)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the setup server can call this.",
    });
  }

  return next();
});

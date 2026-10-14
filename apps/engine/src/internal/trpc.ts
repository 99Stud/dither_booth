import { isAllowedConfiguredOrigin } from "@dither-booth/ports/origin";
import { TRPCError, initTRPC } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;

const publicProcedure = t.procedure;

const adminOriginProcedure = publicProcedure.use(({ ctx, next }) => {
  if (
    !isAllowedConfiguredOrigin(
      ctx.requestOrigin,
      ctx.adminOrigin,
      ctx.allowedHostnames,
    )
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
  }

  return next();
});

/** What the kiosk calls during a guest visit. Reachable from any origin. */
export const boothProcedure = publicProcedure;

/** Event, prize and print authoring, plus operator test prints. */
export const configProcedure = adminOriginProcedure;

/** Health checks and recovery actions for the booth's own services. */
export const opsProcedure = adminOriginProcedure;

import { isAllowedConfiguredOrigin } from "@dither-booth/ports";
import { TRPCError, initTRPC } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const adminOriginProcedure = publicProcedure.use(({ ctx, next }) => {
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

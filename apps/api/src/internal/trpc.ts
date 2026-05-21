import { TRPCError, initTRPC } from "@trpc/server";

import type { TRPCContext } from "#lib/trpc/trpc.types";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const adminOriginProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.requestOrigin !== new URL(ctx.adminOrigin).origin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Request origin not allowed.",
    });
  }

  return next();
});

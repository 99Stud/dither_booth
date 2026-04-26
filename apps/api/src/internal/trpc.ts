import type { TRPCContext } from "#lib/trpc/trpc.types";

import { initTRPC } from "@trpc/server";

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

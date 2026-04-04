import type { AppRouter } from "@dither-booth/api/appRouter";

import { TRPCClientError } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

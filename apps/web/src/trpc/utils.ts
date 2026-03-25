import type { AppRouter } from "@dither-booth/api/appRouter";

import { TRPCClientError } from "@trpc/client";

export function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

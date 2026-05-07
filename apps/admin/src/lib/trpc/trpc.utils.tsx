import type { ApiRouter } from "@dither-booth/api/router.types";

import { TRPCClientError } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<ApiRouter> {
  return cause instanceof TRPCClientError;
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<ApiRouter>();

export const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
};

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

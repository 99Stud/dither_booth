export const base64ToBlob = (base64: string, mimeType: string) => {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
};

import type { ApiRouter } from "@dither-booth/api/router.types";

import { TRPCClientError, type TRPCClient } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export type PrintTicketSequenceProgress = {
  step:
    | "load_config"
    | "decode"
    | "prepare_receipt"
    | "prepare_lottery"
    | "printing_receipt"
    | "printing_lottery";
};

/**
 * SSE subscriptions send `input` in the URL; large base64 payloads must not be passed here.
 * Call `registerPrintTicketSequence` (POST) first, then subscribe with `{ jobId }` only.
 */
export const subscribePrintTicketSequence = (
  client: TRPCClient<ApiRouter>,
  input: { jobId: string },
  onProgress: (value: PrintTicketSequenceProgress) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let settled = false;
    client.onPrintTicketSequence.subscribe(input, {
      onData: onProgress,
      onError: (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      },
      onComplete: () => {
        if (settled) return;
        settled = true;
        resolve();
      },
    });
  });
};

export function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<ApiRouter> {
  return cause instanceof TRPCClientError;
}

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<ApiRouter>();

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

export const subscribePrintTicketSequence = (
  client: TRPCClient<ApiRouter>,
  input: {
    receiptImage: string;
    lotteryTicketImage: string;
    clientFlowId?: string;
  },
  onProgress: (value: PrintTicketSequenceProgress) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const sub = client.onPrintTicketSequence.subscribe(input, {
      onData: onProgress,
      onError: reject,
      onComplete: () => {
        sub.unsubscribe();
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

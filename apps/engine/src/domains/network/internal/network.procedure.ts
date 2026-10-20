import { TRPCError } from "@trpc/server";

import { NetworkManagerUnavailableError } from "./network.nmcli";

/** NetworkManager's own message is what staff need: wrong password, no such network. */
export async function asNetworkRequest<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof NetworkManagerUnavailableError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error ? error.message : "Network change failed.",
      cause: error,
    });
  }
}

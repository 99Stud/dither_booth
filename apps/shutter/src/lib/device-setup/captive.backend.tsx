import type { EngineRouter } from "@dither-booth/engine/router.types";

import { SETUP_SERVER_TOKEN_HEADER } from "@dither-booth/shared/server/network";
import { TRPCClientError, createTRPCClient, httpLink } from "@trpc/client";

import type { CaptiveBackend } from "./device-setup.server";

/** An input the engine refused: staff need a sentence, not zod's report. */
const toStaffError = (error: unknown) => {
  if (!(error instanceof TRPCClientError) || !error.data?.zodError) {
    return error;
  }

  return error.data.zodError.fieldErrors?.pin
    ? new Error("The staff PIN is 4 to 8 digits.")
    : new Error("Check the network name and password.");
};

/**
 * The engine's `captive.*` procedures. The token is read on every call: the
 * engine writes a new one each time it starts.
 */
export function createCaptiveBackend(options: {
  engineOrigin: string;
  tokenPath: string;
}): CaptiveBackend {
  const engine = createTRPCClient<EngineRouter>({
    links: [
      httpLink({
        url: options.engineOrigin,
        headers: async () => ({
          [SETUP_SERVER_TOKEN_HEADER]: (
            await Bun.file(options.tokenPath)
              .text()
              .catch(() => "")
          ).trim(),
        }),
      }),
    ],
  });

  return {
    getStatus: () => engine.captive.getCaptiveStatus.query(),
    join: (input) =>
      engine.captive.joinFromCaptive.mutate(input).catch((error: unknown) => {
        throw toStaffError(error);
      }),
  };
}

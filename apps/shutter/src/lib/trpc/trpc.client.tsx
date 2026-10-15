import type { EngineRouter } from "@dither-booth/engine/router.types";

import { createDitherBoothTRPCReact } from "@dither-booth/shared/browser/trpc-client";
import { DARKROOM_TOKEN_HEADER } from "@dither-booth/shared/darkroom";

import { getDarkroomToken } from "#lib/darkroom/darkroom-token";

export const { TRPCProvider, queryClient, trpcClient, useTRPC } =
  createDitherBoothTRPCReact<EngineRouter>({
    // The Darkroom's print-tuning calls carry its session token.
    getHeaders: (): Record<string, string> => {
      const token = getDarkroomToken();
      return token ? { [DARKROOM_TOKEN_HEADER]: token } : {};
    },
  });

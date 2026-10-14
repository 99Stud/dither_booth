import type { EngineRouter } from "@dither-booth/engine/router.types";

import { createDitherBoothTRPCReact } from "@dither-booth/shared/browser/trpc-client";

export const { TRPCProvider, queryClient, trpcClient, useTRPC } =
  createDitherBoothTRPCReact<EngineRouter>();

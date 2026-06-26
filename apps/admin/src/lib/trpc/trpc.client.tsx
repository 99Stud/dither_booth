import type { ApiRouter } from "@dither-booth/api/router.types";

import { createDitherBoothTRPCReact } from "@dither-booth/shared/trpc/client";

export const { TRPCProvider, queryClient, trpcClient, useTRPC } =
  createDitherBoothTRPCReact<ApiRouter>();

import type { AppRouter } from "@dither-booth/api/appRouter";

import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from "@trpc/client";

import { TRPC_PROXY_PATH } from "./constants";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => isNonJsonSerializable(op.input),
      true: httpLink({
        url: TRPC_PROXY_PATH,
      }),
      false: httpBatchLink({
        url: TRPC_PROXY_PATH,
      }),
    }),
  ],
});

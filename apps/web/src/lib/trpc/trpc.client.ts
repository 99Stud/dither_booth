import type { ApiRouter } from "@dither-booth/api/router.types";

import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  httpSubscriptionLink,
  isNonJsonSerializable,
  splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

import { TRPC_PROXY_PATH } from "./trpc.constants";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false,
    },
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const trpcClient = createTRPCClient<ApiRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: TRPC_PROXY_PATH,
      }),
      false: splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        true: httpLink({
          url: TRPC_PROXY_PATH,
        }),
        false: httpBatchLink({
          url: TRPC_PROXY_PATH,
        }),
      }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<ApiRouter>({
  client: trpcClient,
  queryClient,
});

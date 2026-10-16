import type { AnyTRPCRouter } from "@trpc/server";

import { QueryClient } from "@tanstack/react-query";
import {
  TRPCClientError,
  createTRPCClient,
  httpBatchLink,
  httpLink,
  httpSubscriptionLink,
  isNonJsonSerializable,
  splitLink,
} from "@trpc/client";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";

import { TRPC_PROXY_PATH } from "#isomorphic/trpc-proxy";

type JsonTRPCRouter = AnyTRPCRouter & {
  _def: {
    _config: {
      $types: {
        transformer: false;
      };
    };
  };
};

export function createDitherBoothQueryClient() {
  return new QueryClient({
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
}

export type DitherBoothTRPCClientOptions = {
  /** Extra headers for every query and mutation, read at request time. */
  getHeaders?: () => Record<string, string>;
};

export function createDitherBoothTRPCClient<TRouter extends JsonTRPCRouter>({
  getHeaders,
}: DitherBoothTRPCClientOptions = {}) {
  const headers = () => getHeaders?.() ?? {};

  return createTRPCClient<TRouter>({
    links: [
      splitLink({
        // Subscriptions (the kiosk channel) stream over server-sent events.
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink<TRouter, typeof EventSource>({
          url: TRPC_PROXY_PATH,
        } as Parameters<
          typeof httpSubscriptionLink<TRouter, typeof EventSource>
        >[0]),
        false: splitLink({
          // Blobs can't be batched; neither can a slow call (`skipBatch`
          // context) that would hold back the fast ones sharing its batch.
          condition: (op) =>
            isNonJsonSerializable(op.input) || Boolean(op.context.skipBatch),
          true: httpLink<TRouter>({
            ...({
              url: TRPC_PROXY_PATH,
            } as Parameters<typeof httpLink<TRouter>>[0]),
            headers,
          }),
          false: httpBatchLink<TRouter>({
            ...({
              url: TRPC_PROXY_PATH,
            } as Parameters<typeof httpBatchLink<TRouter>>[0]),
            headers,
          }),
        }),
      }),
    ],
  });
}

export function createDitherBoothTRPCReact<TRouter extends JsonTRPCRouter>(
  options: DitherBoothTRPCClientOptions = {},
) {
  const queryClient = createDitherBoothQueryClient();
  const trpcClient = createDitherBoothTRPCClient<TRouter>(options);
  const trpc = createTRPCOptionsProxy<TRouter>({
    client: trpcClient,
    queryClient,
  });
  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<TRouter>();

  function isTRPCClientError(
    cause: unknown,
  ): cause is TRPCClientError<TRouter> {
    return cause instanceof TRPCClientError;
  }

  return {
    TRPCProvider,
    isTRPCClientError,
    queryClient,
    trpc,
    trpcClient,
    useTRPC,
    useTRPCClient,
  };
}

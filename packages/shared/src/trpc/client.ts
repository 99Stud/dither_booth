import type { AnyTRPCRouter } from "@trpc/server";

import { QueryClient } from "@tanstack/react-query";
import {
  TRPCClientError,
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  splitLink,
} from "@trpc/client";
import {
  createTRPCContext,
  createTRPCOptionsProxy,
} from "@trpc/tanstack-react-query";

import { TRPC_PROXY_PATH } from "./index";

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

export function createDitherBoothTRPCClient<TRouter extends JsonTRPCRouter>() {
  return createTRPCClient<TRouter>({
    links: [
      splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        true: httpLink<TRouter>({
          url: TRPC_PROXY_PATH,
        } as Parameters<typeof httpLink<TRouter>>[0]),
        false: httpBatchLink<TRouter>({
          url: TRPC_PROXY_PATH,
        } as Parameters<typeof httpBatchLink<TRouter>>[0]),
      }),
    ],
  });
}

export function createDitherBoothTRPCReact<TRouter extends JsonTRPCRouter>() {
  const queryClient = createDitherBoothQueryClient();
  const trpcClient = createDitherBoothTRPCClient<TRouter>();
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

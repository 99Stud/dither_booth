import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@api/router";

const url = import.meta.env?.BUN_PUBLIC_TRPC_URL ?? "http://localhost:3000";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url,
    }),
  ],
});

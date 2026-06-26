import type { inferOutput } from "@trpc/tanstack-react-query";

import type { useTRPC } from "#lib/trpc/trpc.client";

export type HealthzResponse = inferOutput<
  ReturnType<typeof useTRPC>["getHealthz"]
>;

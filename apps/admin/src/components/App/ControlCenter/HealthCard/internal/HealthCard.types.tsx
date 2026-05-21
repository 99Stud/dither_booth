import type { inferOutput } from "@trpc/tanstack-react-query";

import type { useTRPC } from "#lib/trpc/trpc.utils";

export type HealthzResponse = inferOutput<
  ReturnType<typeof useTRPC>["getHealthz"]
>;

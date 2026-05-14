import type { useTRPC } from "#lib/trpc/trpc.utils";
import type { inferOutput } from "@trpc/tanstack-react-query";

export type HealthzResponse = inferOutput<
  ReturnType<typeof useTRPC>["getHealthz"]
>;

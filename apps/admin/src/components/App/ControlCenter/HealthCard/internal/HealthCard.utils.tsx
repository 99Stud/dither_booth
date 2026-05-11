import type { useTRPC } from "#lib/trpc/trpc.utils";
import type { inferOutput } from "@trpc/tanstack-react-query";

export const extractUnhealthyServices = (
  healthz: inferOutput<ReturnType<typeof useTRPC>["getHealthz"]>,
) => {
  const unhealthyServices = [];

  if (!healthz.web.healthz.ok) {
    unhealthyServices.push("web");
  }

  if (!healthz.api.healthz.ok) {
    unhealthyServices.push("api");
  }

  return unhealthyServices;
};

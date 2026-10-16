import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * The Darkroom's URL, at the Shutter origin the engine reports, or
 * undefined until the engine answers.
 */
export const useDarkroomHref = (): string | undefined => {
  const trpc = useTRPC();
  const { data: healthz } = useQuery(
    trpc.ops.getHealthz.queryOptions(undefined, {
      staleTime: Infinity,
      // Health waits on the Shutter: alone, so a booth whose Shutter is
      // down never stalls the page's own queries batched with it.
      trpc: { context: { skipBatch: true } },
    }),
  );
  return healthz
    ? new URL(DARKROOM_PATH, healthz.shutter.origin).toString()
    : undefined;
};

import { trpc } from "#trpc/client.ts";
import { useQuery } from "@tanstack/react-query";

import { DITHER_CONFIGURATION_QUERY_KEY } from "./constants";

export const useDitherConfiguration = () => {
  return useQuery({
    queryKey: [DITHER_CONFIGURATION_QUERY_KEY],
    queryFn: () => trpc.getDitherConfiguration.query(),
  });
};

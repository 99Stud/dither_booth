import { useQuery } from "@tanstack/react-query";

import { fetchUpdateSnapshot } from "./update.client";
import { UPDATE_POLL_IDLE_MS } from "./update.constants";

export const UPDATE_QUERY_KEY = ["update"] as const;

/**
 * The update snapshot for whoever only shows it (the sidebar's dot, the
 * Health card's row): the same cache as the Software panel, read every
 * minute. Null off the booth.
 */
export const useUpdateSnapshot = () =>
  useQuery({
    queryKey: UPDATE_QUERY_KEY,
    queryFn: ({ signal }) => fetchUpdateSnapshot(signal),
    refetchInterval: UPDATE_POLL_IDLE_MS,
    retry: false,
  });

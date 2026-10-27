import { useQueries } from "@tanstack/react-query";

import { queryClient, trpc } from "#lib/trpc/trpc.client";

import { useKit } from "./useKit";

export type PartnerLogo = {
  id: string;
  src: string;
};

/**
 * A logo's PNG never changes under its id, so it is fetched once. A logo the
 * booth can't read isn't retried: the ticket waits for this fetch.
 */
const logoQueryOptions = (id: string) => ({
  ...trpc.booth.getLogoAsset.queryOptions({ id }),
  staleTime: Infinity,
  retry: false,
});

const partnerLogoQuery = (id: string) => ({
  ...logoQueryOptions(id),
  select: (logo: { base64: string }): PartnerLogo => ({
    id,
    src: `data:image/png;base64,${logo.base64}`,
  }),
});

/**
 * Fetches the partners' logos before a ticket renders, so the partner row
 * draws on its first render. A logo that can't be read is left out of the
 * row: the ticket still prints.
 */
export const prefetchPartnerLogos = async (ids: readonly string[]) => {
  await Promise.allSettled(
    ids.map((id) => queryClient.ensureQueryData(logoQueryOptions(id))),
  );
};

/** The event's partner logos that have loaded, in the event's order. */
export const usePartnerLogos = (): PartnerLogo[] => {
  const { partners } = useKit();
  return useQueries({
    queries: partners.map(partnerLogoQuery),
    combine: (results) =>
      results.flatMap((result) => (result.data ? [result.data] : [])),
  });
};

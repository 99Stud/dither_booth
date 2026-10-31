import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useEffect } from "react";

import { useTRPC } from "#lib/trpc/trpc.client";

import { signOutStaff } from "./staff-session.client";

const isForbidden = (error: unknown) =>
  error instanceof TRPCClientError &&
  (error.data as { code?: unknown } | undefined)?.code === "FORBIDDEN";

/**
 * Whether this page is signed in with the staff PIN. When an engine call is
 * refused (the token idled out, the engine restarted, the PIN changed), it
 * asks again, so the PIN screen comes back.
 */
export function useStaffSession() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    ...trpc.booth.getDarkroomSession.queryOptions(),
    refetchOnWindowFocus: true,
  });
  const { refetch } = sessionQuery;

  useEffect(() => {
    const onError = (error: unknown) => {
      if (isForbidden(error)) void refetch();
    };
    const unsubscribeQueries = queryClient
      .getQueryCache()
      .subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error") {
          onError(event.action.error);
        }
      });
    const unsubscribeMutations = queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (event.type === "updated" && event.action.type === "error") {
          onError(event.action.error);
        }
      });

    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient, refetch]);

  return sessionQuery;
}

/** Signs this page out and drops everything it read while signed in. */
export function useLockAdmin() {
  const queryClient = useQueryClient();

  return async () => {
    await signOutStaff();
    // Clears every page's data and asks the session again: the PIN screen.
    await queryClient.resetQueries();
  };
}

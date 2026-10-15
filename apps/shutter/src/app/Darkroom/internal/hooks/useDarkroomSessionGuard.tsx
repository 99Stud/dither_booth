import { useEffect } from "react";
import { toast } from "sonner";

import {
  clearDarkroomSession,
  getDarkroomToken,
} from "#lib/darkroom/darkroom-token";
import { queryClient } from "#lib/trpc/trpc.client";

import { getTRPCErrorCode } from "../Darkroom.utils";

/**
 * Locks the Darkroom as soon as the engine refuses its token: it expired,
 * the PIN was changed in admin, or the engine restarted.
 */
export const useDarkroomSessionGuard = () => {
  useEffect(() => {
    const onError = (error: unknown) => {
      if (getTRPCErrorCode(error) !== "FORBIDDEN" || !getDarkroomToken()) {
        return;
      }

      clearDarkroomSession();
      toast.info("The Darkroom locked itself. Enter the PIN again.");
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
  }, []);
};

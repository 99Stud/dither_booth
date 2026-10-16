import { useMutation } from "@tanstack/react-query";

import { clearDarkroomSession } from "#lib/darkroom/darkroom-token";
import { useTRPC } from "#lib/trpc/trpc.client";

/** Ends the Darkroom session, on the engine and in this tab. */
export const useLockDarkroom = () => {
  const trpc = useTRPC();
  const { mutateAsync: lockDarkroom, isPending } = useMutation(
    trpc.booth.lockDarkroom.mutationOptions(),
  );

  const lock = async () => {
    // The token is dropped locally even if the engine can't be reached.
    await lockDarkroom().catch(() => undefined);
    clearDarkroomSession();
  };

  return { lock, isPending };
};

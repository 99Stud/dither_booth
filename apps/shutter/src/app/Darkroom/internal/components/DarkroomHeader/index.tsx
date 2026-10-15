import type { FC, ReactNode } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";

import { clearDarkroomSession } from "#lib/darkroom/darkroom-token";
import { useTRPC } from "#lib/trpc/trpc.client";

/** Title, the print tuning tabs, and the way out (Lock, Back to booth). */
export const DarkroomHeader: FC<{ tabs: ReactNode }> = ({ tabs }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { mutateAsync: lockDarkroom, isPending } = useMutation(
    trpc.booth.lockDarkroom.mutationOptions(),
  );

  const lock = async () => {
    // The token is dropped locally even if the engine can't be reached.
    await lockDarkroom().catch(() => undefined);
    clearDarkroomSession();
  };

  return (
    <header
      className={clsx(
        "h-14 px-3",
        "flex items-center justify-between gap-3",
        "border-b",
      )}
    >
      <h1 className={clsx("text-lg font-semibold")}>Darkroom</h1>
      {tabs}
      <div className={clsx("flex gap-2")}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void navigate({ to: "/" })}
        >
          Back to booth
        </Button>
        <Button size="sm" disabled={isPending} onClick={() => void lock()}>
          Lock
        </Button>
      </div>
    </header>
  );
};

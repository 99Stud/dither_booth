import type { FC, ReactNode } from "react";

import { ThemeToggle } from "@dither-booth/ui/components/misc/ThemeToggle";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import clsx from "clsx";
import { Aperture, ArrowLeft, Lock } from "lucide-react";

import { useDarkroomTheme } from "#lib/darkroom/darkroom-theme";
import { clearDarkroomSession } from "#lib/darkroom/darkroom-token";
import { useTRPC } from "#lib/trpc/trpc.client";

/**
 * The Darkroom's app bar: who/where on the left, the print tuning tabs in
 * the middle, theme and the ways out on the right. Sized for an iPad, with
 * 40 px touch targets.
 */
export const DarkroomHeader: FC<{ tabs: ReactNode }> = ({ tabs }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { preference, setPreference } = useDarkroomTheme();
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
        "sticky top-0 z-30",
        "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 lg:px-6",
        "border-b bg-background/85 backdrop-blur",
      )}
    >
      <div className={clsx("flex min-w-0 items-center gap-3")}>
        <span
          className={clsx(
            "flex size-10 shrink-0 items-center justify-center",
            "rounded-xl bg-primary text-primary-foreground",
          )}
        >
          <Aperture className="size-5" />
        </span>
        <div className={clsx("leading-tight")}>
          <h1 className={clsx("text-base font-semibold")}>Darkroom</h1>
          <p className={clsx("text-xs text-muted-foreground")}>Print tuning</p>
        </div>
      </div>

      <div className={clsx("order-last w-full md:order-none md:w-auto")}>
        {tabs}
      </div>

      <div className={clsx("ml-auto flex items-center gap-2")}>
        <ThemeToggle value={preference} onValueChange={setPreference} />
        <Separator
          orientation="vertical"
          className="mx-1 data-vertical:h-6 data-vertical:self-center"
        />
        <Button
          size="lg"
          variant="ghost"
          onClick={() => void navigate({ to: "/" })}
        >
          <ArrowLeft data-icon="inline-start" />
          Booth
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={isPending}
          onClick={() => void lock()}
        >
          <Lock data-icon="inline-start" />
          Lock
        </Button>
      </div>
    </header>
  );
};

import type { FC } from "react";

import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { useTRPC } from "#lib/trpc/trpc.client";

interface KitLogoProps {
  id: string;
  name: string;
  className?: string;
}

/**
 * A logo exactly as the booth keeps it, black on paper white, so staff see
 * how it prints. The paper stays white in dark mode too.
 */
export const KitLogo: FC<KitLogoProps> = (props) => {
  const { id, name, className } = props;
  const trpc = useTRPC();
  const logo = useQuery({
    ...trpc.booth.getLogoAsset.queryOptions({ id }),
    staleTime: Infinity,
  });

  return (
    <div
      className={clsx(
        // ds-allow-hardcode: thermal paper is white whatever the theme.
        "flex items-center justify-center rounded-md bg-white p-1.5",
        "ring-1 ring-border",
        className,
      )}
    >
      {logo.data ? (
        <img
          src={`data:image/png;base64,${logo.data.base64}`}
          alt={name}
          className={clsx(
            "max-h-full max-w-full object-contain",
            "[image-rendering:pixelated]",
          )}
        />
      ) : (
        <Skeleton className={clsx("size-full")} />
      )}
    </div>
  );
};
